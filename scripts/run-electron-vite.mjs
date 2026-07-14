// Launch electron-vite with a clean environment.
//
// Some parent processes (notably VS Code / Electron-based shells) export
// ELECTRON_RUN_AS_NODE=1, which makes the `electron` binary behave as plain
// Node.js — the GUI never launches and `electron.app` is undefined. We strip
// that (and the related run-as-node flags) before spawning so dev/preview work
// regardless of how the terminal was started. Harmless when the vars are unset.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Normalize a lowercase Windows drive letter in cwd (c:\… → C:\…). Some shells
// hand out a lowercase drive; rollup/vite then see the same module under two
// path spellings and the build can fail with a spurious "error during build".
if (process.platform === 'win32' && /^[a-z]:/.test(process.cwd())) {
  process.chdir(process.cwd()[0].toUpperCase() + process.cwd().slice(1));
}

const require = createRequire(import.meta.url);
const pkgJsonPath = require.resolve('electron-vite/package.json');
const pkg = require('electron-vite/package.json');
const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin['electron-vite'];
const cli = join(dirname(pkgJsonPath), binRel);

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_NO_ATTACH_CONSOLE;

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
