import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 8000);
const clients = new Map();
const qrSessions = new Map();

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

function safeText(value, fallback = '', maxLength = 80) {
  return String(value || fallback).trim().slice(0, maxLength);
}

function publicClient(client) {
  return {
    clientId: client.clientId,
    displayName: client.displayName,
    deviceType: client.deviceType,
    photoUrl: client.photoUrl || ''
  };
}

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function broadcast(message, exceptSocket = null) {
  for (const socket of clients.keys()) {
    if (socket !== exceptSocket) send(socket, message);
  }
}

function broadcastUsers() {
  const users = Array.from(clients.values())
    .filter(client => client.clientId)
    .map(publicClient);
  broadcast({ type: 'users', payload: users });
}

function findSocket(clientId) {
  for (const [socket, client] of clients.entries()) {
    if (client.clientId === clientId) return socket;
  }
  return null;
}

function handleMessage(socket, rawMessage) {
  let message;
  try {
    message = JSON.parse(rawMessage.toString());
  } catch {
    send(socket, { type: 'error', payload: { message: 'Invalid JSON message.' } });
    return;
  }

  const client = clients.get(socket);
  const payload = message.payload || {};

  if (message.type === 'announce') {
    client.clientId = safeText(payload.clientId, crypto.randomUUID(), 120);
    client.displayName = safeText(payload.displayName, 'Nearby device', 40);
    client.deviceType = safeText(payload.deviceType, 'Unknown', 30);
    broadcastUsers();
    return;
  }

  if (!client.clientId) {
    send(socket, { type: 'error', payload: { message: 'Announce before sending messages.' } });
    return;
  }

  if (message.type === 'profile_update') {
    client.displayName = safeText(payload.name, client.displayName, 40);
    client.deviceType = safeText(payload.deviceType, client.deviceType, 30);
    client.photoUrl = safeText(payload.photoUrl, '', 2_000_000);
    broadcast({
      type: 'profile_update',
      payload: {
        userId: client.clientId,
        name: client.displayName,
        deviceType: client.deviceType,
        photoUrl: client.photoUrl
      }
    }, socket);
    broadcastUsers();
    return;
  }

  if (message.type === 'signal') {
    const targetSocket = findSocket(safeText(payload.to, '', 120));
    if (targetSocket) {
      send(targetSocket, {
        type: 'signal',
        payload: { ...payload, from: client.clientId }
      });
    }
    return;
  }

  if (message.type === 'qr_create') {
    const sessionId = safeText(payload.sessionId, '', 120);
    if (!sessionId) return;
    qrSessions.set(sessionId, client.clientId);
    send(socket, { type: 'qr_session_created', payload: { sessionId } });
    return;
  }

  if (message.type === 'qr_join') {
    const sessionId = safeText(payload.sessionId, '', 120);
    const targetId = qrSessions.get(sessionId) || safeText(payload.targetId, '', 120);
    const targetSocket = findSocket(targetId);
    const target = targetSocket && clients.get(targetSocket);

    if (!targetSocket || !target) {
      send(socket, { type: 'error', payload: { message: 'QR session is no longer available.' } });
      return;
    }

    send(socket, {
      type: 'qr_paired',
      payload: { peer: publicClient(target), initiator: true, sessionId }
    });
    send(targetSocket, {
      type: 'qr_paired',
      payload: { peer: publicClient(client), initiator: false, sessionId }
    });
    qrSessions.delete(sessionId);
  }
}

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const requestedPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  const normalizedPath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(root, normalizedPath);

  if (!filePath.startsWith(root) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  createReadStream(filePath).pipe(response);
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  if (new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, webSocket => wss.emit('connection', webSocket));
});

wss.on('connection', socket => {
  clients.set(socket, { clientId: '', displayName: 'Nearby device', deviceType: 'Unknown', photoUrl: '' });
  socket.on('message', rawMessage => handleMessage(socket, rawMessage));
  socket.on('close', () => {
    const departed = clients.get(socket);
    clients.delete(socket);
    if (departed?.clientId) {
      for (const [sessionId, clientId] of qrSessions.entries()) {
        if (clientId === departed.clientId) qrSessions.delete(sessionId);
      }
      broadcastUsers();
    }
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`WebDrop running at http://localhost:${port}`);
});
