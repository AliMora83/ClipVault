// Maps a keydown in the history view to an action. Pure, so it can be unit-tested.

/**
 * @typedef {{ type: 'move', by: number } | { type: 'jump', to: 'first' | 'last' }
 *   | { type: 'choose', paste: 'default' | false } | { type: 'pick', index: number }
 *   | { type: 'pin' } | { type: 'delete' } | { type: 'escape' } | { type: 'settings' } | { type: 'switchTab' }} KeyAction
 */

/**
 * @param {{ key: string, metaKey?: boolean, ctrlKey?: boolean, shiftKey?: boolean }} e
 * @param {boolean} isMac
 * @returns {KeyAction | null} null when the key should go to the search box as typing
 */
export function resolveKey(e, isMac) {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  const key = e.key;

  if (key === 'ArrowDown') return { type: 'move', by: 1 };
  if (key === 'ArrowUp') return { type: 'move', by: -1 };
  if (key === 'PageDown') return { type: 'jump', to: 'last' };
  if (key === 'PageUp') return { type: 'jump', to: 'first' };
  if (key === 'Enter') return { type: 'choose', paste: e.shiftKey ? false : 'default' };
  if (key === 'Escape') return { type: 'escape' };
  if (key === 'Tab') return { type: 'switchTab' };
  if (!mod) return null;
  if (/^[1-9]$/.test(key)) return { type: 'pick', index: Number(key) - 1 };
  if (key.toLowerCase() === 'p') return { type: 'pin' };
  if (key === 'Backspace' || key === 'Delete') return { type: 'delete' };
  if (key === ',') return { type: 'settings' };
  return null;
}
