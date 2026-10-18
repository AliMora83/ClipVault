// Turns a keydown event into an Electron accelerator string for the shortcut recorder.

const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Shift', 'Alt']);

/** Accelerators the main process will accept: modifiers plus one key, joined by "+". */
export const ACCELERATOR_PATTERN =
  /^((CommandOrControl|Command|Control|Alt|Shift)\+){1,4}([A-Z0-9]|F([1-9]|1[0-9]|2[0-4])|Space|`)$/;

/**
 * @param {{ key: string, code: string, metaKey: boolean, ctrlKey: boolean, altKey: boolean, shiftKey: boolean }} e
 * @param {boolean} isMac
 * @returns {{ accelerator?: string, error?: string, pending?: boolean }}
 */
export function toAccelerator(e, isMac) {
  if (MODIFIER_KEYS.has(e.key)) return { pending: true }; // still waiting for the main key

  const mods = [];
  if (isMac ? e.metaKey : e.ctrlKey) mods.push('CommandOrControl');
  if (isMac && e.ctrlKey) mods.push('Control');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (mods.length === 0 || (mods.length === 1 && mods[0] === 'Shift')) {
    return { error: `Hold ${isMac ? '⌘, ⌃ or ⌥' : 'Ctrl or Alt'} together with a key.` };
  }

  const key = keyFromCode(e.code);
  if (!key) return { error: 'Use a letter, number, F-key, Space or `.' };
  return { accelerator: [...mods, key].join('+') };
}

function keyFromCode(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  if (code === 'Space') return 'Space';
  if (code === 'Backquote') return '`';
  return null;
}
