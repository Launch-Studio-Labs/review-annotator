// Bundles the extension into dist/ (load that folder unpacked).
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const watch = process.argv.includes('--watch');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(resolve(root, 'public'), dist, { recursive: true });

const options = {
  entryPoints: {
    background: resolve(root, 'src/background.ts'),
    content: resolve(root, 'src/content/index.ts'),
  },
  outdir: dist,
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  loader: { '.css': 'text' },
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Watching… reload the extension after changes.');
} else {
  await esbuild.build(options);
}
