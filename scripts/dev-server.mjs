import http from 'node:http';
import next from 'next';
import { WebSocketServer } from 'ws';
import { isVoiceWebhookAuthorized } from '../lib/config.js';
import { bridgeMedia } from '../lib/realtime-bridge.js';

const port = Number(process.env.PORT || 3000);
const app = next({ dev: true });
const handle = app.getRequestHandler();
const mediaServer = new WebSocketServer({ noServer: true });

await app.prepare();

const server = http.createServer((request, response) => handle(request, response));

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (url.pathname !== '/api/ws') {
    socket.destroy();
    return;
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) headers.set(key, value.join(', '));
    else if (value) headers.set(key, value);
  }
  if (!isVoiceWebhookAuthorized(new Request(url, { headers }))) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  mediaServer.handleUpgrade(request, socket, head, (mediaSocket) => bridgeMedia(mediaSocket));
});

server.listen(port, () => {
  console.log(`Monica local voice bridge is ready at http://localhost:${port}`);
});
