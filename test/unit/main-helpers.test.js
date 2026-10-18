import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { placeNear } from '../../src/main/geometry.js';
import { Hotkey } from '../../src/main/hotkey.js';
import { SIGNATURES, createNativePaster } from '../../src/main/native-keys.js';
import { resolveKey } from '../../src/renderer/keymap.js';

const require = createRequire(import.meta.url);

test('placeNear centres on the cursor and stays inside the screen', () => {
  const area = { x: 0, y: 0, width: 1440, height: 900 };
  const size = { width: 560, height: 460 };
  assert.deepEqual(placeNear({ x: 720, y: 300 }, area, size), { x: 440, y: 260 });
  assert.deepEqual(placeNear({ x: 5, y: 5 }, area, size), { x: 8, y: 8 }); // top-left corner
  assert.deepEqual(placeNear({ x: 1439, y: 899 }, area, size), { x: 872, y: 432 }); // bottom-right corner
  // second display to the left of the primary one
  assert.deepEqual(placeNear({ x: -500, y: 400 }, { x: -1920, y: 0, width: 1920, height: 1080 }, size), {
    x: -780,
    y: 360,
  });
});

test('Hotkey swaps shortcuts and reports conflicts', () => {
  const registered = new Set(['CommandOrControl+Shift+C']); // already taken by another app
  const fake = {
    register: (acc) => (registered.has(acc) ? false : (registered.add(acc), true)),
    unregister: (acc) => registered.delete(acc),
  };
  const hotkey = new Hotkey(fake, () => {});
  assert.equal(hotkey.set('CommandOrControl+Shift+V'), true);
  assert.equal(hotkey.current, 'CommandOrControl+Shift+V');
  assert.equal(hotkey.set('CommandOrControl+Shift+C'), false);
  assert.equal(hotkey.current, null);
  assert.ok(!registered.has('CommandOrControl+Shift+V'), 'old shortcut was released');
});

test('native keystroke signatures parse with koffi', () => {
  const koffi = require('koffi');
  for (const sigs of Object.values(SIGNATURES)) {
    for (const signature of Object.values(sigs)) assert.doesNotThrow(() => koffi.proto(signature), signature);
  }
});

test('native paster is only built on macOS and Windows', () => {
  assert.equal(createNativePaster({}, 'linux'), null);
});

test('macOS native paster sends ⌘V down then up and releases every event', () => {
  const calls = [];
  const fakeKoffi = {
    load: () => ({
      func: (sig) => {
        const name = sig.match(/(\w+)\(/)[1];
        return (...args) => {
          calls.push([name, ...args]);
          return name.startsWith('CGEventCreate') || name === 'CGEventSourceCreate' ? { ptr: calls.length } : undefined;
        };
      },
    }),
  };
  createNativePaster(fakeKoffi, 'darwin')();
  const names = calls.map((c) => c[0]);
  assert.deepEqual(names.filter((n) => n === 'CGEventPost').length, 2);
  const [down, up] = calls.filter((c) => c[0] === 'CGEventCreateKeyboardEvent');
  assert.deepEqual([down[2], down[3], up[2], up[3]], [9, true, 9, false]); // kVK_ANSI_V
  assert.ok(calls.filter((c) => c[0] === 'CGEventSetFlags').every((c) => c[2] === 0x00100000)); // ⌘ only
  assert.equal(names.filter((n) => n === 'CFRelease').length, 3);
});

test('Windows native paster presses Ctrl+V and releases in reverse order', () => {
  const calls = [];
  const fakeKoffi = {
    load: () => ({
      func:
        () =>
        (...args) =>
          calls.push(args),
    }),
  };
  createNativePaster(fakeKoffi, 'win32')();
  assert.deepEqual(
    calls.map(([vk, , flags]) => [vk, flags]),
    [
      [0x11, 0],
      [0x56, 0],
      [0x56, 2],
      [0x11, 2],
    ],
  );
});

test('resolveKey maps popup shortcuts per platform', () => {
  assert.deepEqual(resolveKey({ key: 'ArrowDown' }, true), { type: 'move', by: 1 });
  assert.deepEqual(resolveKey({ key: 'Enter' }, true), { type: 'choose', paste: 'default' });
  assert.deepEqual(resolveKey({ key: 'Enter', shiftKey: true }, true), { type: 'choose', paste: false });
  assert.deepEqual(resolveKey({ key: '3', metaKey: true }, true), { type: 'pick', index: 2 });
  assert.deepEqual(resolveKey({ key: '3', ctrlKey: true }, false), { type: 'pick', index: 2 });
  assert.equal(resolveKey({ key: '3', ctrlKey: true }, true), null, '⌃3 is not the mac shortcut');
  assert.deepEqual(resolveKey({ key: 'P', metaKey: true, shiftKey: true }, true), { type: 'pin' });
  assert.equal(resolveKey({ key: 'p' }, true), null, 'plain letters go to search');
});
