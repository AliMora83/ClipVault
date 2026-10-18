import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ClipboardWatcher } from '../../src/main/capture.js';
import { Store } from '../../src/main/store.js';

/** In-memory stand-in for Electron's async clipboard. */
function fakeClipboard() {
  return {
    text: '',
    formats: new Set(),
    async readText() {
      return this.text;
    },
    async has(format) {
      return [...this.formats].some((f) => format.includes(`"${f}"`));
    },
  };
}

function setup() {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'clipvault-'))).load();
  const clipboard = fakeClipboard();
  const watcher = new ClipboardWatcher({ clipboard, store, concealedFormats: ['org.nspasteboard.ConcealedType'] });
  return { store, clipboard, watcher };
}

test('records new clipboard text', async () => {
  const { store, clipboard, watcher } = setup();
  clipboard.text = 'hello';
  assert.equal(await watcher.tick(), true);
  assert.equal(store.history[0].text, 'hello');
});

test('does not record the same text twice in a row', async () => {
  const { store, clipboard, watcher } = setup();
  clipboard.text = 'hello';
  await watcher.tick();
  assert.equal(await watcher.tick(), false);
  assert.equal(store.history.length, 1);
});

test('ignores what was on the clipboard before it started', async () => {
  const { store, clipboard, watcher } = setup();
  clipboard.text = 'already there';
  await watcher.start();
  watcher.stop();
  assert.equal(await watcher.tick(), false);
  assert.equal(store.history.length, 0);
});

test('skips clips that password managers mark as concealed', async () => {
  const { store, clipboard, watcher } = setup();
  clipboard.text = 'hunter2';
  clipboard.formats.add('org.nspasteboard.ConcealedType');
  assert.equal(await watcher.tick(), false);
  assert.equal(store.history.length, 0);
});

test('records nothing while paused', async () => {
  const { store, clipboard, watcher } = setup();
  store.updateSettings({ paused: true });
  clipboard.text = 'secret plans';
  assert.equal(await watcher.tick(), false);
  assert.equal(store.history.length, 0);
});

test('ignore() stops our own clipboard writes being recorded as new', async () => {
  const { store, clipboard, watcher } = setup();
  watcher.ignore('from history');
  clipboard.text = 'from history';
  assert.equal(await watcher.tick(), false);
  assert.equal(store.history.length, 0);
});

test('overlapping polls do not double-record', async () => {
  const { store, clipboard, watcher } = setup();
  clipboard.text = 'once';
  await Promise.all([watcher.tick(), watcher.tick(), watcher.tick()]);
  assert.equal(store.history.length, 1);
});

test('a clipboard read error is treated as empty', async () => {
  const { store, watcher } = setup();
  watcher.clipboard.readText = async () => {
    throw new Error('busy');
  };
  assert.equal(await watcher.tick(), false);
  assert.equal(store.history.length, 0);
});
