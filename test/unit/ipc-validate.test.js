import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipId, selectOptions, settingsPatch, IpcValidationError } from '../../src/main/ipc-validate.js';

const rejects = (fn) => assert.throws(fn, IpcValidationError);

test('clipId accepts UUIDs and rejects anything else', () => {
  assert.equal(clipId('3f2a9c1e-8b4d-4e2a-9f1c-1234567890ab'), '3f2a9c1e-8b4d-4e2a-9f1c-1234567890ab');
  rejects(() => clipId(42));
  rejects(() => clipId('../../etc/passwd'));
  rejects(() => clipId(''));
});

test('selectOptions only allows a boolean paste flag', () => {
  assert.deepEqual(selectOptions({ paste: true }), { paste: true });
  assert.deepEqual(selectOptions(), {});
  rejects(() => selectOptions({ paste: 'yes' }));
  rejects(() => selectOptions({ paste: true, run: 'rm -rf' }));
  rejects(() => selectOptions([]));
});

test('settingsPatch accepts known keys with the right types', () => {
  assert.deepEqual(settingsPatch({ paused: true, historyLimit: 200 }), { paused: true, historyLimit: 200 });
  assert.deepEqual(settingsPatch({ hotkey: 'CommandOrControl+Alt+C' }), { hotkey: 'CommandOrControl+Alt+C' });
});

test('settingsPatch rejects unknown keys, wrong types and bad values', () => {
  rejects(() => settingsPatch({ isAdmin: true }));
  rejects(() => settingsPatch({ paused: 1 }));
  rejects(() => settingsPatch({ historyLimit: 3 }));
  rejects(() => settingsPatch({ historyLimit: 1.5 }));
  rejects(() => settingsPatch({ hotkey: 'V' }));
  rejects(() => settingsPatch({ hotkey: 'CommandOrControl+Shift+V; rm -rf' }));
  rejects(() => settingsPatch(null));
  rejects(() => settingsPatch(Object.create({ paused: true })));
});
