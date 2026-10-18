// End-to-end smoke test: boots the real app with a temporary profile, copies text,
// drives the popup with the keyboard and checks the results.
//
//   npm run test:e2e                         (macOS / Windows)
//   xvfb-run -a npm run test:e2e             (Linux, headless; add -- --no-sandbox when running as root)
//   SMOKE_SCREENSHOTS=out npm run test:e2e   (also saves screenshots)

import { app, BrowserWindow, clipboard, nativeTheme } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'clipvault-e2e-'));
app.setPath('userData', profile);
const shotsDir = process.env.SMOKE_SCREENSHOTS;

await import('../../src/main/index.js');

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(['✓', name]);
  } catch (err) {
    results.push(['✗', name, err.message]);
  }
}

app.whenReady().then(async () => {
  await wait(1200);
  const win = BrowserWindow.getAllWindows()[0];
  const wc = win.webContents;
  const rendererErrors = [];
  wc.on('console-message', ({ level, message }) => {
    if (level === 'error') rendererErrors.push(message);
  });

  const state = () => wc.executeJavaScript('window.clipvault.getState()');
  const press = async (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await wait(120);
  };
  const shot = async (name) => {
    if (!shotsDir) return;
    fs.mkdirSync(shotsDir, { recursive: true });
    fs.writeFileSync(path.join(shotsDir, `${name}.png`), (await win.capturePage()).toPNG());
  };
  const mod = process.platform === 'darwin' ? 'meta' : 'control';

  await step('popup page loads with no errors', async () => {
    assert.equal(await wc.executeJavaScript('document.querySelector("#search") !== null'), true);
  });

  await step('captures copies from the system clipboard', async () => {
    const clips = [
      'https://github.com/termit/Flycut',
      'const total = items.reduce((sum, i) => sum + i.price, 0);',
      'Meeting moved to Thursday 10:00, same Zoom link.',
      'ali@example.com',
      '   ', // blank: skipped
      'https://github.com/termit/Flycut', // duplicate: moves to the top
      'SELECT * FROM clips WHERE pinned = 1 ORDER BY last_used DESC;',
    ];
    for (const text of clips) {
      await clipboard.writeText(text);
      await wait(650);
    }
    const { history } = await state();
    assert.deepEqual(
      history.map((h) => h.text),
      [clips[6], clips[0], clips[3], clips[2], clips[1]],
    );
  });

  // Opens the popup through the app's real path (a second launch shows it, like the shortcut does).
  const openPopup = async () => {
    app.emit('second-instance');
    await wait(400);
  };

  await step('opens and lists the clips', async () => {
    await openPopup();
    assert.equal(await wc.executeJavaScript('document.querySelectorAll(".item").length'), 5);
    await shot('history-light');
  });

  await step('arrow keys move the selection and ⌘/Ctrl+P pins it', async () => {
    await press('Down');
    await press('Down');
    await press('P', [mod]);
    await wait(200);
    const { history } = await state();
    assert.deepEqual(
      history.filter((h) => h.pinned).map((h) => h.text),
      ['ali@example.com'],
    );
  });

  await step('search filters and highlights matches', async () => {
    await wc.executeJavaScript(
      `(() => { const s = document.getElementById('search'); s.value = 'github'; s.dispatchEvent(new Event('input')); })()`,
    );
    await wait(150);
    assert.equal(await wc.executeJavaScript('document.querySelectorAll(".item").length'), 1);
    assert.equal(await wc.executeJavaScript('document.querySelector(".item mark").textContent'), 'github');
    await shot('search');
    await press('Escape'); // clears the search, keeps the popup open
    assert.equal(await wc.executeJavaScript('document.getElementById("search").value'), '');
  });

  await step('settings open in dark mode', async () => {
    nativeTheme.themeSource = 'dark';
    await press(',', [mod]);
    await wait(250);
    assert.equal(await wc.executeJavaScript('document.getElementById("view-settings").hidden'), false);
    await shot('settings-dark');
    await press('Escape');
    await wait(150);
    await shot('history-dark');
  });

  await step('Shift+Enter copies the selected clip back and hides the popup', async () => {
    const expected = await wc.executeJavaScript(
      '[...document.querySelectorAll(".item .text")].map((e) => e.textContent)[1]',
    );
    await press('Down');
    await press('Return', ['shift']);
    await wait(600);
    assert.equal(await clipboard.readText(), expected);
    assert.equal(win.isVisible(), false);
    const { history } = await state();
    assert.equal(history.length, 5, 'copying back must not create a duplicate');
    assert.equal(history[0].text, expected, 'the used clip moves to the top');
  });

  await step('counts usage and shows it on the Usage screen', async () => {
    const usage = await wc.executeJavaScript('window.clipvault.getUsage()');
    const t = usage.current.totals;
    assert.equal(t.captured, 6, 'six non-blank copies, including the repeated link; the blank one is skipped');
    assert.equal(t.copied, 1, 'one Shift+Enter copy-back');
    assert.equal(t.opened, 1, 'opening the popup is counted');
    assert.equal(usage.current.used, 1);

    nativeTheme.themeSource = 'light';
    await openPopup();
    await press(',', [mod]);
    await wc.executeJavaScript('document.getElementById("open-usage").click()');
    await wait(400);
    assert.equal(await wc.executeJavaScript('document.getElementById("view-usage").hidden'), false);
    assert.equal(await wc.executeJavaScript('document.getElementById("u-used").textContent'), '1');
    assert.equal(await wc.executeJavaScript('document.getElementById("u-captured").textContent'), '6');
    assert.equal(await wc.executeJavaScript('document.querySelectorAll("#u-chart .chart-bar").length'), 1);
    await shot('usage-light');
    await press('Escape'); // back to Settings, where Usage was opened from
    assert.equal(await wc.executeJavaScript('document.getElementById("view-settings").hidden'), false);
    await press('Escape');
    assert.equal(await wc.executeJavaScript('document.getElementById("view-history").hidden'), false);
  });

  await step('stats never contain clip text', async () => {
    await wait(1200); // stats are saved after a 1 s debounce
    const raw = fs.readFileSync(path.join(profile, 'stats.json'), 'utf8');
    assert.ok(!raw.includes('github') && !raw.includes('SELECT'), 'no clip content in stats.json');
  });

  await step('rejects malformed IPC input', async () => {
    const err = await wc.executeJavaScript(
      `window.clipvault.setSettings({ historyLimit: 'lots' }).then(() => 'accepted', (e) => e.message)`,
    );
    assert.match(err, /must be a number/);
  });

  await step('renderer logged no errors', async () => {
    assert.deepEqual(rendererErrors, []);
  });

  for (const [mark, name, detail] of results) console.log(`${mark} ${name}${detail ? `\n    ${detail}` : ''}`);
  const failed = results.filter(([mark]) => mark === '✗').length;
  console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed`);
  fs.rmSync(profile, { recursive: true, force: true });
  app.exit(failed ? 1 : 0);
});
