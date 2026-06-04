export class WebSocketClient {
  constructor(url, bus) {
    this.url = url;
    this.bus = bus;
    this.socket = null;
    this.connected = false;
    this.clientId = crypto.randomUUID();
    this._retryDelay = 3000;
    this._displayName = '';
    this._deviceType = '';
  }

  connect(displayName, deviceType) {
    this._displayName = displayName;
    this._deviceType  = deviceType;

    // Signal "attempting connection" immediately
    window.dispatchEvent(new CustomEvent('webdrop:ws:connecting'));

    try {
      this.socket = new WebSocket(this.url);
    } catch (err) {
      // Malformed URL or WS not supported
      console.warn('[WS] Could not create socket:', err.message);
      window.dispatchEvent(new CustomEvent('webdrop:ws:disconnected'));
      this._scheduleRetry();
      return;
    }

    this.socket.addEventListener('open', () => {
      this.connected   = true;
      this._retryDelay = 3000; // reset backoff
      this.send({ type: 'announce', payload: { clientId: this.clientId, displayName, deviceType } });
      this.bus.emit('ws:connected');
      window.dispatchEvent(new CustomEvent('webdrop:ws:connected'));
    });

    this.socket.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (e) {
        console.error('[WS] Invalid message:', e);
      }
    });

    // 'error' fires before 'close' when the connection is refused / URL unreachable
    this.socket.addEventListener('error', () => {
      window.dispatchEvent(new CustomEvent('webdrop:ws:disconnected'));
    });

    this.socket.addEventListener('close', () => {
      if (this.connected) {
        this.connected = false;
        this.bus.emit('ws:disconnected');
        window.dispatchEvent(new CustomEvent('webdrop:ws:disconnected'));
      }
      this._scheduleRetry();
    });
  }

  _scheduleRetry() {
    const delay = this._retryDelay;
    this._retryDelay = Math.min(this._retryDelay * 1.5, 30000); // cap at 30s
    setTimeout(() => this.connect(this._displayName, this._deviceType), delay);
  }

  handleMessage(msg) {
    if (msg.type === 'users')              this.bus.emit('users:discovered',    msg.payload);
    else if (msg.type === 'signal')        this.bus.emit('webrtc:signal',        msg.payload);
    else if (msg.type === 'qr_session_created') this.bus.emit('qr:session_created', msg.payload);
    else if (msg.type === 'qr_paired')     this.bus.emit('qr:paired',            msg.payload);
  }

  send(message) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  sendSignal(to, signalData) {
    this.send({ type: 'signal', payload: { to, from: this.clientId, ...signalData } });
  }
}
