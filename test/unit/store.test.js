import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store, sanitizeSettings, DEFAULT_SETTINGS } from '../../src/main/store.js';

const fresh = () => new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'clipvault-'))).load();
const texts = (s) => s.history.map((h) => h.text);

test('adds clips newest first', () => {
  const s = fresh();
  s.add('one', 1);
  s.add('two', 2);
  assert.deepEqual(texts(s), ['two', 'one']);
});

test('a duplicate moves to the top instead of being added again', () => {
  const s = fresh();
  s.add('a', 1);
  s.add('b', 2);
  s.add('a', 3);
  assert.deepEqual(texts(s), ['a', 'b']);
  assert.equal(s.history[0].lastUsedAt, 3);
});

test('skips empty, blank and oversize clips', () => {
  const s = fresh();
  assert.equal(s.add(''), null);
  assert.equal(s.add('   \n\t'), null);
  s.updateSettings({ maxClipLength: 5 });
  assert.equal(s.add('123456'), null);
  s.updateSettings({ ignoreWhitespace: false });
  assert.ok(s.add('  '));
});

test('history limit drops the oldest unpinned clips and never pinned ones', () => {
  const s = fresh();
  s.updateSettings({ historyLimit: 2 });
  s.add('old', 1);
  s.setPinned(s.history[0].id, true);
  ['x', 'y', 'z'].forEach((text, i) => s.add(text, i + 2));
  assert.deepEqual(texts(s), ['z', 'y', 'old']);
});

test('pinned clips do not count toward the limit', () => {
  const s = fresh();
  s.updateSettings({ historyLimit: 1 });
  s.add('p1', 1);
  s.setPinned(s.history[0].id, true);
  s.add('p2', 2);
  s.setPinned(s.history[0].id, true);
  s.add('u', 3);
  assert.equal(s.history.length, 3);
});

test('clear keeps pinned clips; remove deletes one', () => {
  const s = fresh();
  s.add('keep', 1);
  s.setPinned(s.history[0].id, true);
  s.add('drop', 2);
  s.clear({ keepPinned: true });
  assert.deepEqual(texts(s), ['keep']);
  s.remove(s.history[0].id);
  assert.equal(s.history.length, 0);
});

test('touch moves a clip to the top', () => {
  const s = fresh();
  s.add('a', 1);
  s.add('b', 2);
  s.touch(s.history.find((h) => h.text === 'a').id, 5);
  assert.equal(s.history[0].text, 'a');
});

test('emits "change" after every mutation, but not for skipped clips', () => {
  const s = fresh();
  let changes = 0;
  s.on('change', () => changes++);
  s.add('a');
  s.add('   ');
  s.setPinned(s.history[0].id, true);
  s.updateSettings({ paused: true });
  s.remove('missing-id');
  assert.equal(changes, 3);
});

test('invalid settings fall back to the previous value', () => {
  const s = fresh();
  s.updateSettings({ historyLimit: -5, paused: 'yes', bogus: 1 });
  assert.equal(s.settings.historyLimit, DEFAULT_SETTINGS.historyLimit);
  assert.equal(s.settings.paused, false);
  assert.ok(!('bogus' in s.settings));
});

test('sanitizeSettings caps the history size', () => {
  assert.equal(sanitizeSettings({ historyLimit: 999_999 }).historyLimit, 5000);
});

test('persists history and settings to disk', () => {
  const s = fresh();
  s.add('saved', 1);
  s.updateSettings({ historyLimit: 42 });
  s.flush();
  const again = new Store(s.dir).load();
  assert.equal(again.history[0].text, 'saved');
  assert.equal(again.settings.historyLimit, 42);
});

test('survives corrupt files', () => {
  const s = fresh();
  fs.writeFileSync(s.historyFile, '{not json');
  fs.writeFileSync(s.settingsFile, '"a string"');
  const again = new Store(s.dir).load();
  assert.deepEqual(again.history, []);
  assert.deepEqual(again.settings, DEFAULT_SETTINGS);
});
