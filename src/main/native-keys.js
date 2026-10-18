// Sends the system "paste" keystroke from inside the app process, the way FlyCut does,
// using koffi (a prebuilt FFI library: no compiler or native build step needed).
//   macOS:   CoreGraphics CGEventPost — needs only the Accessibility permission.
//   Windows: user32 keybd_event — no permission needed.
// Linux has no equivalent that works across X11 and Wayland, so paste.js uses xdotool there.

/** C prototypes, exported so tests can check they parse. */
export const SIGNATURES = {
  mac: {
    CGEventSourceCreate: 'void *CGEventSourceCreate(int32_t stateID)',
    CGEventCreateKeyboardEvent: 'void *CGEventCreateKeyboardEvent(void *source, uint16_t virtualKey, bool keyDown)',
    CGEventSetFlags: 'void CGEventSetFlags(void *event, uint64_t flags)',
    CGEventPost: 'void CGEventPost(uint32_t tap, void *event)',
    CFRelease: 'void CFRelease(void *cf)',
  },
  win: {
    keybd_event: 'void __stdcall keybd_event(uint8_t bVk, uint8_t bScan, uint32_t dwFlags, uintptr_t dwExtraInfo)',
  },
};

const MAC = {
  coreGraphics: '/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics',
  coreFoundation: '/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation',
  kCGEventSourceStateCombinedSessionState: 0,
  kCGSessionEventTap: 1,
  kCGEventFlagMaskCommand: 0x00100000,
  kVK_ANSI_V: 9,
};

const WIN = { VK_CONTROL: 0x11, VK_V: 0x56, KEYEVENTF_KEYUP: 0x0002 };

/**
 * Builds a paste function for the platform, or returns null if the native library
 * can't be loaded (the caller then falls back to a scripted keystroke).
 * @param {typeof import('koffi')} koffi
 * @param {NodeJS.Platform} platform
 * @returns {(() => void) | null}
 */
export function createNativePaster(koffi, platform) {
  if (platform === 'darwin') return macPaster(koffi);
  if (platform === 'win32') return winPaster(koffi);
  return null;
}

function macPaster(koffi) {
  const cg = koffi.load(MAC.coreGraphics);
  const cf = koffi.load(MAC.coreFoundation);
  const sig = SIGNATURES.mac;
  const CGEventSourceCreate = cg.func(sig.CGEventSourceCreate);
  const CGEventCreateKeyboardEvent = cg.func(sig.CGEventCreateKeyboardEvent);
  const CGEventSetFlags = cg.func(sig.CGEventSetFlags);
  const CGEventPost = cg.func(sig.CGEventPost);
  const CFRelease = cf.func(sig.CFRelease);

  return function pasteMac() {
    const source = CGEventSourceCreate(MAC.kCGEventSourceStateCombinedSessionState);
    const down = CGEventCreateKeyboardEvent(source, MAC.kVK_ANSI_V, true);
    const up = CGEventCreateKeyboardEvent(source, MAC.kVK_ANSI_V, false);
    try {
      // Set ⌘ explicitly so a held Shift or ⌥ doesn't turn this into a different shortcut.
      CGEventSetFlags(down, MAC.kCGEventFlagMaskCommand);
      CGEventSetFlags(up, MAC.kCGEventFlagMaskCommand);
      CGEventPost(MAC.kCGSessionEventTap, down);
      CGEventPost(MAC.kCGSessionEventTap, up);
    } finally {
      if (down) CFRelease(down);
      if (up) CFRelease(up);
      if (source) CFRelease(source);
    }
  };
}

function winPaster(koffi) {
  const user32 = koffi.load('user32.dll');
  const keybd_event = user32.func(SIGNATURES.win.keybd_event);
  return function pasteWindows() {
    keybd_event(WIN.VK_CONTROL, 0, 0, 0);
    keybd_event(WIN.VK_V, 0, 0, 0);
    keybd_event(WIN.VK_V, 0, WIN.KEYEVENTF_KEYUP, 0);
    keybd_event(WIN.VK_CONTROL, 0, WIN.KEYEVENTF_KEYUP, 0);
  };
}
