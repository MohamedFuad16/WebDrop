export class WebSocketClient {
  constructor(url, bus) {
    this.url = url;
    this.bus = bus;
    this.socket = null;
    this.connected = false;
    this.clientId = crypto.randomUUID();
  }

  connect(displayName, deviceType) {
    this.socket = new WebSocket(this.url);
    
    this.socket.addEventListener('open', () => {
      this.connected = true;
      this.send({
        type: 'announce',
        payload: {
          clientId: this.clientId,
          displayName,
          deviceType
        }
      });
      this.bus.emit('ws:connected');
    });

    this.socket.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (e) {
        console.error('Invalid WebSocket message', e);
      }
    });

    this.socket.addEventListener('close', () => {
      this.connected = false;
      this.bus.emit('ws:disconnected');
      setTimeout(() => this.connect(displayName, deviceType), 3000);
    });
  }

  handleMessage(msg) {
    if (msg.type === 'users') {
      this.bus.emit('users:discovered', msg.payload);
    } else if (msg.type === 'signal') {
      this.bus.emit('webrtc:signal', msg.payload);
    } else if (msg.type === 'qr_session_created') {
      this.bus.emit('qr:session_created', msg.payload);
    } else if (msg.type === 'qr_paired') {
      this.bus.emit('qr:paired', msg.payload);
    }
  }

  send(message) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  sendSignal(to, signalData) {
    this.send({
      type: 'signal',
      payload: {
        to,
        from: this.clientId,
        ...signalData
      }
    });
  }
}
