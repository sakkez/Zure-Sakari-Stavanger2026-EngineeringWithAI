import { build } from 'esbuild';

await build({
  entryPoints: ['src/client.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  outfile: 'dist/client.js',
  minify: true,
});
await build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: 'dist/server.js',
  packages: 'external',
});
