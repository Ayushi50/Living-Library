// Minimal static server for ./dist (used for local preview and the browser tests).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('../dist/', import.meta.url).pathname;
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = normalize(join(root, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch {
    try {
      res.writeHead(200, { 'content-type': types['.html'] }).end(await readFile(join(root, 'index.html')));
    } catch { res.writeHead(404).end('Not found'); }
  }
}).listen(port, () => console.log(`Serving dist on http://localhost:${port}`));
