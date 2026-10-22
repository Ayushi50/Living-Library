// Bundles the app with esbuild into ./dist. `--watch` serves it on http://localhost:5173
import 'dotenv/config';
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

// Optional build-time configuration (never put secrets here; these are public endpoints).
//   TMDB_PROXY_URL  - URL of your own proxy that forwards to TMDB and holds the API key server-side.
//   SUPABASE_URL / SUPABASE_ANON_KEY - public client settings; database access is protected by RLS.
const define = {
  'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production'),
  __TMDB_PROXY_URL__: JSON.stringify(process.env.TMDB_PROXY_URL ?? ''),
  __SUPABASE_URL__: JSON.stringify(process.env.SUPABASE_URL ?? ''),
  __SUPABASE_ANON_KEY__: JSON.stringify(process.env.SUPABASE_ANON_KEY ?? ''),
};

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

function copyHtml() {
  const html = readFileSync('index.html', 'utf8');
  writeFileSync(`${outdir}/index.html`, html);
}

const options = {
  entryPoints: { app: 'src/main.tsx' },
  bundle: true,
  outdir,
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  minify: !watch,
  sourcemap: watch,
  define,
  loader: { '.css': 'css' },
  logLevel: 'info',
};

copyHtml();
cpSync('public', outdir, { recursive: true });

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: outdir, port: 5173, fallback: `${outdir}/index.html` });
  console.log(`Living Library dev server: http://localhost:${port}`);
} else {
  await esbuild.build(options);
  console.log('Built to ./dist  (serve with any static server, e.g. `npx serve dist`)');
}
