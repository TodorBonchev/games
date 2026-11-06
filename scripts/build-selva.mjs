import { execFileSync } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../selva/app/', import.meta.url));
const output = new URL('../selva/', import.meta.url);
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: app, stdio: 'inherit' });
// Publish only the generated entry and assets. Authoring files stay intact.
await rm(new URL('assets/', output), { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL('build/assets/', output), new URL('assets/', output), { recursive: true });
await cp(new URL('build/index.html', output), new URL('index.html', output));
console.log('Selva Oscura → selva/ (static, single player)');
