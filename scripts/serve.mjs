// Serves test/fixtures on http://localhost:5178 so you can try the demo page.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../test/fixtures');
const port = Number(process.env.PORT ?? 5178);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };

export function serve(listenPort = port) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = normalize(join(dir, url.pathname === '/' ? 'demo.html' : url.pathname));
    if (!path.startsWith(dir)) return res.writeHead(403).end();
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  return new Promise((ok) => server.listen(listenPort, '127.0.0.1', () => ok(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await serve();
  console.log(`Demo page: http://localhost:${port}/`);
}
