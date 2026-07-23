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

const server = http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let filePath = null;
    const play = url.pathname.match(/^\/play\/([a-z0-9-]+)\/?(.*)$/);
    if (play) {
      const gameDir = path.resolve(ROOT, 'games', play[1]);
      filePath = path.resolve(gameDir, play[2] || 'index.html');
      // contain to the game dir (matches the production route's guard) and never serve _shots
      if (!filePath.startsWith(gameDir + path.sep) && filePath !== path.join(gameDir, 'index.html')) filePath = null;
      if (filePath && (play[2] || '').includes('_shots')) filePath = null;
    } else if (url.pathname.startsWith('/vendor/')) {
      const vendorDir = path.resolve(ROOT, 'public', 'vendor');
      filePath = path.resolve(ROOT, 'public', url.pathname.replace(/^\//, ''));
      if (!filePath.startsWith(vendorDir + path.sep)) filePath = null;
    }
    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(filePath)] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
// PORT 0 = OS-assigned (the pipeline uses this to avoid collisions between
// concurrent builds); the startup line below is the contract it parses.
server.listen(PORT, () => console.log(`game server on http://localhost:${server.address().port}  (e.g. /play/<slug>/)`));
