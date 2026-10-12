// Starts the app that was just built (dist/) and checks it works: the Biggle browser loads from the
// app's own files, the desktop bridge is there, and it shows the sign-in screen. Run after
// scripts/dist.mjs, on the system it built for (the release workflow does).
import { execFileSync, spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 9333;
const fail = (message) => {
  console.error(`Smoke test failed: ${message}`);
  process.exit(1);
};

/** Where to find the app, and the address the browser should be at. */
function app() {
  if (process.platform === 'darwin') {
    const dir = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
    return { cmd: join('dist', dir, 'Bigglenet.app', 'Contents', 'MacOS', 'Bigglenet'), args: [], origin: 'app://bigglenet' };
  }
  if (process.platform === 'win32') {
    // Install it the way the updater does: quietly.
    const setup = readdirSync(join('dist', 'release')).find((n) => n.endsWith('-setup.exe'));
    execFileSync(join('dist', 'release', setup), ['/S'], { stdio: 'inherit' });
    return { cmd: join(process.env.LOCALAPPDATA, 'Programs', 'bigglenet', 'Bigglenet.exe'), args: [], origin: 'http://tauri.localhost' };
  }
  // Linux: the unpacked app (what the AppImage runs), on a virtual screen. The CI machine has no
  // display and no sandbox helper set up.
  return { cmd: 'xvfb-run', args: ['-a', join('dist', 'linux-unpacked', 'bigglenet'), '--no-sandbox'], origin: 'app://bigglenet' };
}

const { cmd, args, origin } = app();
const child = spawn(cmd, [...args, `--remote-debugging-port=${PORT}`], { stdio: 'inherit' });
child.on('exit', (code) => fail(`the app quit (${code})`));

/** Ask the page something, over Chromium's debugging protocol. */
async function evaluate(page, expression) {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const reply = new Promise((resolve) => (ws.onmessage = (e) => resolve(JSON.parse(e.data))));
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  const { result } = await reply;
  ws.close();
  return result?.result?.value;
}

let page;
for (let i = 0; i < 60 && !page; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  try {
    const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    page = pages.find((p) => p.type === 'page' && p.url.startsWith(origin));
  } catch {}
}
if (!page) fail(`no page at ${origin}`);

// Give the browser a moment to start.
let state;
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  state = await evaluate(page, `({ title: document.title, bridge: typeof window.bigglenet, text: document.body.innerText })`);
  if (state?.text?.includes('Biggle ID')) break;
}
console.log({ url: page.url, title: state?.title, bridge: state?.bridge, text: state?.text?.slice(0, 80) });
if (state?.bridge !== 'object') fail("the desktop bridge isn't there");
if (!state?.text?.includes('Biggle ID')) fail("the sign-in screen didn't show");

child.removeAllListeners('exit');
child.kill();
console.log('Smoke test passed.');
process.exit(0);
