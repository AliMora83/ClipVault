import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipKind, sizeLabel } from '../../src/shared/clip-kind.js';
import { filterClips, prettyHotkey, preview, timeAgo } from '../../src/shared/format.js';
import { toAccelerator, ACCELERATOR_PATTERN } from '../../src/shared/accelerator.js';
import { DEFAULT_SETTINGS } from '../../src/main/store.js';

test('clipKind recognises links, emails, code and prose', () => {
  assert.deepEqual(clipKind('https://www.github.com/termit/Flycut'), { type: 'link', label: 'Link to github.com' });
  assert.equal(clipKind('ali@example.com').type, 'email');
  assert.equal(clipKind('const total = items.reduce((sum, i) => sum + i.price, 0);').type, 'code');
  assert.equal(clipKind('SELECT * FROM clips WHERE pinned = 1').type, 'code');
  assert.equal(clipKind('<div class="card">\n  <p>Hi</p>\n</div>').type, 'code');
  assert.equal(clipKind('Meeting moved to Thursday 10:00, same Zoom link.').type, 'text');
  assert.equal(clipKind('Let me know if this works for you; thanks!').type, 'text');
});

test('sizeLabel describes lines, words or characters', () => {
  assert.equal(sizeLabel('one\ntwo\nthree'), '3 lines');
  assert.equal(sizeLabel('a few short words'), '4 words');
  assert.equal(sizeLabel('word'), '4 chars');
});

test('prettyHotkey uses symbols on macOS and words elsewhere', () => {
  assert.equal(prettyHotkey('CommandOrControl+Shift+V', 'darwin'), '⌘⇧V');
  assert.equal(prettyHotkey('CommandOrControl+Shift+V', 'win32'), 'Ctrl+Shift+V');
  assert.equal(prettyHotkey('', 'darwin'), '');
});

test('preview collapses whitespace and truncates', () => {
  assert.equal(preview('  a\n\n b  ', 10), 'a b');
  assert.equal(preview('abcdefghij', 5), 'abcd…');
});

test('timeAgo', () => {
  const now = 1_000_000_000;
  assert.equal(timeAgo(now - 3_000, now), 'just now');
  assert.equal(timeAgo(now - 45_000, now), '45s ago');
  assert.equal(timeAgo(now - 5 * 60_000, now), '5 min ago');
  assert.equal(timeAgo(now - 3 * 3_600_000, now), '3 h ago');
  assert.equal(timeAgo(now - 2 * 86_400_000, now), '2 d ago');
});

test('filterClips puts pinned first, filters by tab and search', () => {
  const history = [
    { id: '1', text: 'Alpha', pinned: false },
    { id: '2', text: 'beta', pinned: true },
    { id: '3', text: 'alphabet', pinned: false },
  ];
  assert.deepEqual(
    filterClips(history).map((c) => c.id),
    ['2', '1', '3'],
  );
  assert.deepEqual(
    filterClips(history, { filter: 'pinned' }).map((c) => c.id),
    ['2'],
  );
  assert.deepEqual(
    filterClips(history, { query: ' ALPHA ' }).map((c) => c.id),
    ['1', '3'],
  );
});

const key = (code, mods = {}) => ({ key: code.replace(/^Key|^Digit/, ''), code, ...mods });

test('toAccelerator builds accelerators from key presses', () => {
  assert.deepEqual(toAccelerator(key('KeyV', { metaKey: true, shiftKey: true }), true), {
    accelerator: 'CommandOrControl+Shift+V',
  });
  assert.deepEqual(toAccelerator(key('Digit1', { ctrlKey: true, altKey: true }), false), {
    accelerator: 'CommandOrControl+Alt+1',
  });
  assert.deepEqual(toAccelerator({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }, true), { pending: true });
  assert.ok(toAccelerator(key('KeyV', { shiftKey: true }), true).error, 'Shift alone is not enough');
  assert.ok(toAccelerator({ key: 'é', code: 'Quote', metaKey: true }, true).error);
});

test('every accelerator the recorder can produce passes main-process validation', () => {
  assert.match(DEFAULT_SETTINGS.hotkey, ACCELERATOR_PATTERN);
  for (const code of ['KeyA', 'Digit0', 'F12', 'Space', 'Backquote']) {
    const { accelerator } = toAccelerator(
      { key: 'x', code, metaKey: true, ctrlKey: true, altKey: true, shiftKey: true },
      true,
    );
    assert.match(accelerator, ACCELERATOR_PATTERN);
  }
});
