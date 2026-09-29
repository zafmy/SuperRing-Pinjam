import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { SessionStore } from './store';

// Resetting to {} on a parse error would silently drop every session; fail loudly instead.
test('corrupt sessions.json fails loudly and is left untouched', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pinjam-store-'));
  try {
    const file = join(directory, 'sessions.json');
    writeFileSync(file, '{not json');
    assert.throws(() => new SessionStore(directory), SyntaxError);
    assert.equal(readFileSync(file, 'utf8'), '{not json');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
