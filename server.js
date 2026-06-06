"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 8000);
const clients = new Map();
const qrSessions = new Map();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function safeText(value, fallback = "", maxLength = 80) {
  return String(value || fallback).trim().slice(0, maxLength);
}

function publicClient(client) {
  return {
    clientId: client.clientId,
    displayName: client.displayName,
    deviceType: client.deviceType,
    photoUrl: client.photoUrl || ""
  };
}

function frameText(message) {
  const payload = Buffer.from(JSON.stringify(message));
  const length = payload.length;
  let header;

  if (length < 126) {
    header = Buffer.from([0x81, length]);
  } else if (length <= 0xffff) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  return Buffer.concat([header, payload]);
}

function send(socket, message) {
  if (!socket.destroyed && socket.writable) socket.write(frameText(message));
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
  broadcast({ type: "users", payload: users });
}

function findSocket(clientId) {
  for (const [socket, client] of clients.entries()) {
    if (client.clientId === clientId) return socket;
  }
  return null;
}

function handleJsonMessage(socket, rawMessage) {
  let message;
  try {
    message = JSON.parse(rawMessage);
  } catch {
    send(socket, { type: "error", payload: { message: "Invalid JSON message." } });
    return;
  }

  const client = clients.get(socket);
  const payload = message.payload || {};

  if (message.type === "announce") {
    client.clientId = safeText(payload.clientId, crypto.randomUUID(), 120);
    client.displayName = safeText(payload.displayName, "Nearby device", 40);
    client.deviceType = safeText(payload.deviceType, "Unknown", 30);
    broadcastUsers();
    return;
  }

  if (!client.clientId) {
    send(socket, { type: "error", payload: { message: "Announce before sending messages." } });
    return;
  }

  if (message.type === "profile_update") {
    client.displayName = safeText(payload.name, client.displayName, 40);
    client.deviceType = safeText(payload.deviceType, client.deviceType, 30);
    client.photoUrl = safeText(payload.photoUrl, "", 2_000_000);
    broadcast({
      type: "profile_update",
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

  if (message.type === "signal") {
    const targetSocket = findSocket(safeText(payload.to, "", 120));
    if (targetSocket) {
      send(targetSocket, {
        type: "signal",
        payload: { ...payload, from: client.clientId }
      });
    }
    return;
  }

  if (message.type === "qr_create") {
    const sessionId = safeText(payload.sessionId, "", 120);
    if (!sessionId) return;
    qrSessions.set(sessionId, client.clientId);
    send(socket, { type: "qr_session_created", payload: { sessionId } });
    return;
  }

  if (message.type === "qr_join") {
    const sessionId = safeText(payload.sessionId, "", 120);
    const targetId = qrSessions.get(sessionId) || safeText(payload.targetId, "", 120);
    const targetSocket = findSocket(targetId);
    const target = targetSocket && clients.get(targetSocket);

    if (!targetSocket || !target) {
      send(socket, { type: "error", payload: { message: "QR session is no longer available." } });
      return;
    }

    send(socket, {
      type: "qr_paired",
      payload: { peer: publicClient(target), initiator: true, sessionId }
    });
    send(targetSocket, {
      type: "qr_paired",
      payload: { peer: publicClient(client), initiator: false, sessionId }
    });
    qrSessions.delete(sessionId);
  }
}

function readFrame(buffer) {
  if (buffer.length < 2) return null;

  const first = buffer[0];
  const second = buffer[1];
  const fin = Boolean(first & 0x80);
  const opcode = first & 0x0f;
  const masked = Boolean(second & 0x80);
  let length = second & 0x7f;
  let offset = 2;

  if (length === 126) {
    if (buffer.length < offset + 2) return null;
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buffer.length < offset + 8) return null;
    const longLength = buffer.readBigUInt64BE(offset);
    if (longLength > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("WebSocket frame is too large.");
    length = Number(longLength);
    offset += 8;
  }

  let mask;
  if (masked) {
    if (buffer.length < offset + 4) return null;
    mask = buffer.subarray(offset, offset + 4);
    offset += 4;
  }

  const frameEnd = offset + length;
  if (buffer.length < frameEnd) return null;

  let payload = buffer.subarray(offset, frameEnd);
  if (masked) {
    payload = Buffer.from(payload, (byte, index) => byte ^ mask[index % 4]);
  }

  return { fin, opcode, payload, consumed: frameEnd };
}

function handleFrame(socket, frame) {
  const client = clients.get(socket);
  if (!client) return;

  if (frame.opcode === 0x8) {
    socket.end();
    return;
  }

  if (frame.opcode === 0x9) {
    socket.write(Buffer.concat([Buffer.from([0x8a, frame.payload.length]), frame.payload]));
    return;
  }

  if (frame.opcode === 0x1 || frame.opcode === 0x0) {
    if (frame.opcode === 0x1 && frame.fin) {
      handleJsonMessage(socket, frame.payload.toString("utf8"));
      return;
    }

    if (frame.opcode === 0x1) client.fragments = [];
    client.fragments.push(frame.payload);

    if (frame.fin) {
      const payload = Buffer.concat(client.fragments).toString("utf8");
      client.fragments = [];
      handleJsonMessage(socket, payload);
    }
  }
}

function cleanupSocket(socket) {
  const departed = clients.get(socket);
  clients.delete(socket);
  if (departed?.clientId) {
    for (const [sessionId, clientId] of qrSessions.entries()) {
      if (clientId === departed.clientId) qrSessions.delete(sessionId);
    }
    broadcastUsers();
  }
}

function acceptWebSocket(request, socket, head) {
  const key = request.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "\r\n"
  ].join("\r\n"));

  clients.set(socket, {
    clientId: "",
    displayName: "Nearby device",
    deviceType: "Unknown",
    photoUrl: "",
    fragments: [],
    buffer: Buffer.alloc(0)
  });

  socket.on("data", chunk => {
    const client = clients.get(socket);
    if (!client) return;
    client.buffer = Buffer.concat([client.buffer, chunk]);

    while (client.buffer.length) {
      let frame;
      try {
        frame = readFrame(client.buffer);
      } catch {
        socket.destroy();
        return;
      }
      if (!frame) break;
      client.buffer = client.buffer.subarray(frame.consumed);
      handleFrame(socket, frame);
    }
  });

  socket.on("end", () => cleanupSocket(socket));
  socket.on("close", () => cleanupSocket(socket));
  socket.on("error", () => cleanupSocket(socket));

  if (head?.length) socket.emit("data", head);
}

function serveStatic(request, response) {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const requestedPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const safePath = path.normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath);

  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer(serveStatic);

server.on("upgrade", (request, socket, head) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (requestUrl.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  acceptWebSocket(request, socket, head);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`WebDrop running at http://localhost:${port}`);
});
