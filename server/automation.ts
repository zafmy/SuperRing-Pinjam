import { agentDecision } from './agent-decision';
import type { Planner } from './agent';
import { SessionStore, StoreError } from './store';

/** One process owns the runner. No browser or persisted bearer token is needed. */
export class AgentRunner {
  private active = new Map<string, { controller: AbortController; missionId: string }>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private unsubscribe: () => void;
  private closed = false;
  constructor(private store: SessionStore, private planner?: Planner, private delayMs = 1000) {
    store.recoverAutomations();
    this.unsubscribe = store.onChange((code) => this.schedule(code));
  }
  configured() { return Boolean(this.planner) && !this.closed; }
  private requirePlanner() {
    if (this.closed) throw new StoreError(503, 'AGENT_UNAVAILABLE', 'Worker dihentikan. Semak storan dan mulakan semula pelayan.');
    if (!this.planner) throw new StoreError(503, 'AGENT_NOT_CONFIGURED', 'Tetapkan CMD_API_KEY pada backend dahulu.');
    return this.planner;
  }
  private lock(code: string, missionId: string) {
    if (this.active.has(code)) throw new StoreError(409, 'AGENT_BUSY', 'Panggilan agent masih berjalan. Tunggu sebentar.');
    const controller = new AbortController();
    this.active.set(code, { controller, missionId });
    return controller;
  }
  abort(code: string, missionId: string) {
    const current = this.active.get(code.toUpperCase());
    if (current?.missionId === missionId) current.controller.abort();
  }
  async manualStep(code: string, token: string, key: string) {
    code = code.toUpperCase();
    this.store.authorize(code, token, 'host');
    const previous = this.store.agentResult(code, token, key);
    if (previous) return previous;
    const planner = this.requirePlanner();
    const session = this.store.read(code, token);
    if (session.automation?.enabled) throw new StoreError(409, 'AUTOMATION_ACTIVE', 'Hentikan mod automatik sebelum langkah manual.');
    if (!session.mission) throw new StoreError(409, 'MISSION_REQUIRED', 'Sahkan misi dahulu.');
    if (session.mission.status === 'completed') throw new StoreError(409, 'MISSION_COMPLETED', 'Misi sudah selesai.');
    if (!session.participants.length) throw new StoreError(409, 'PARTICIPANTS_REQUIRED', 'Jemput peserta dahulu.');
    const controller = this.lock(code, session.mission.id);
    try {
      const images = session.observations.filter((item) => item.mediaId).slice(-6).map((item) => {
        const media = this.store.readMedia(code, token, item.mediaId!);
        return { observationId: item.id, dataUrl: `data:${media.mime};base64,${media.buffer.toString('base64')}` };
      });
      const decision = agentDecision.parse(await planner({ session, images }, controller.signal));
      if (controller.signal.aborted) throw new StoreError(409, 'AGENT_STOPPED', 'Keputusan dibatalkan kerana agent dihentikan.');
      return this.store.applyAgentDecision(code, token, key, session.revision, decision, images.map((item) => item.observationId));
    } catch (error) {
      if (controller.signal.aborted) throw new StoreError(409, 'AGENT_STOPPED', 'Agent dihentikan; keputusan panggilan ini dibatalkan.');
      throw error;
    } finally { this.active.delete(code); this.schedule(code); }
  }
  start(code: string, token: string, key: string, missionId: string, maxSteps: number) {
    code = code.toUpperCase();
    this.store.authorize(code, token, 'host');
    this.requirePlanner();
    if (this.active.has(code) && !this.store.read(code, token).automation?.enabled) throw new StoreError(409, 'AGENT_BUSY', 'Tunggu panggilan sebelumnya tamat.');
    const result = this.store.startAutomation(code, token, key, missionId, maxSteps);
    this.schedule(code);
    return result;
  }
  private schedule(code: string) {
    if (this.closed || this.timers.has(code) || this.active.has(code) || !this.store.workerState(code).automation?.enabled) return;
    const timer = setTimeout(() => {
      this.timers.delete(code);
      void this.tick(code).catch(() => {
        // Persistence faults must never launch more model requests.
        console.error('Automatic agent could not persist its state.');
        this.closed = true;
      });
    }, this.delayMs);
    timer.unref();
    this.timers.set(code, timer);
  }
  async tick(code: string) {
    if (this.closed || this.active.has(code)) return;
    const initial = this.store.workerState(code).automation;
    if (!initial?.enabled) return;
    const runId = initial.runId;
    if (initial.steps >= initial.maxSteps || Date.now() >= Date.parse(initial.deadlineAt)) {
      this.store.haltAutomation(code, runId, 'limit_reached', 'Had langkah atau 20 minit dicapai. Semak kemajuan sebelum menyambung.');
      return;
    }
    if (this.store.workerShouldWait(code, runId)) { this.schedule(code); return; }
    const controller = this.lock(code, initial.missionId);
    try {
      const planner = this.requirePlanner();
      const session = this.store.beginAutomaticStep(code, runId);
      const images = this.store.workerImages(code, runId);
      const decision = agentDecision.parse(await planner({ session, images }, controller.signal));
      if (controller.signal.aborted) return;
      if (Date.now() >= Date.parse(session.automation!.deadlineAt)) {
        this.store.haltAutomation(code, runId, 'limit_reached', 'Had masa dicapai; keputusan lewat dibatalkan.');
        return;
      }
      this.store.applyAutomaticDecision(code, runId, session.revision, decision, images.map((item) => item.observationId));
    } catch (error) {
      if (!controller.signal.aborted) {
        if (!(error instanceof StoreError && error.code === 'AGENT_STALE')) {
          this.store.haltAutomation(code, runId, 'error', error instanceof StoreError ? error.message : 'Agent gagal memproses keputusan. Semak dan cuba semula.');
        }
      }
    } finally {
      this.active.delete(code);
      this.schedule(code);
    }
  }
  close() {
    this.closed = true;
    this.unsubscribe();
    for (const timer of this.timers.values()) clearTimeout(timer);
    for (const value of this.active.values()) value.controller.abort();
    this.timers.clear();
  }
}
