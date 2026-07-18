// Minimal static server that mirrors production paths:
//   /play/<slug>/            -> games/<slug>/index.html
//   /play/<slug>/<file>      -> games/<slug>/<file>
//   /vendor/<file>           -> public/vendor/<file>
// Usage: node scripts/game-server.mjs [port]   (from the app directory)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || 8900);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.css': 'text/css; charset=utf-8',
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let filePath = null;
    const play = url.pathname.match(/^\/play\/([a-z0-9-]+)\/?(.*)$/);
    if (play) {
      filePath = path.join(ROOT, 'games', play[1], play[2] || 'index.html');
    } else if (url.pathname.startsWith('/vendor/')) {
      filePath = path.join(ROOT, 'public', url.pathname);
    }
    if (!filePath || !filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(filePath)] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  })
  .listen(PORT, () => console.log(`game server on http://localhost:${PORT}  (e.g. /play/<slug>/)`));
