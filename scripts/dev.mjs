// Runs the example site, the Biggle server and the browser together, with labelled output.
import { spawn } from 'node:child_process';

const procs = [
  ['site', '\x1b[35m', ['node', 'examples/serve.mjs']],
  ['server', '\x1b[33m', ['npm', 'run', 'dev', '-w', 'server']],
  ['browser', '\x1b[36m', ['npm', 'run', 'dev', '-w', 'browser']],
];

const children = procs.map(([name, color, [cmd, ...args]]) => {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '1' } });
  const label = `${color}[${name}]\x1b[0m `;
  for (const stream of [child.stdout, child.stderr]) {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) process.stdout.write(label + line + '\n');
    });
  }
  child.on('exit', (code) => {
    process.stdout.write(`${label}exited with code ${code}\n`);
    stop(code ?? 1);
  });
  return child;
});

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
