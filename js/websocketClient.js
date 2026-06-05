export class WebSocketClient {
  constructor(url, bus) {
    this.url = url;
    this.bus = bus;
    this.socket = null;
    this.connected = false;
    this.clientId = localStorage.getItem('wd_user_id') || crypto.randomUUID();
    this._retryDelay = 3000;
    this._retryTimer = null;
    this._closedManually = false;
    this._displayName = '';
    this._deviceType = '';

    localStorage.setItem('wd_user_id', this.clientId);
  }

  connect(displayName, deviceType) {
    this._displayName = displayName;
    this._deviceType  = deviceType;
    this._closedManually = false;

    if (this.socket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(this.socket.readyState)) {
      return;
    }

    clearTimeout(this._retryTimer);
    this._retryTimer = null;

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
      this.send({
        type: 'announce',
        payload: {
          clientId: this.clientId,
          displayName: this._displayName,
          deviceType: this._deviceType
        }
      });
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
      const wasConnected = this.connected;
      this.connected = false;
      this.socket = null;
      if (wasConnected) {
        this.bus.emit('ws:disconnected');
      }
      window.dispatchEvent(new CustomEvent('webdrop:ws:disconnected'));
      if (!this._closedManually) this._scheduleRetry();
    });
  }

  _scheduleRetry() {
    if (this._retryTimer || this._closedManually) return;
    const delay = this._retryDelay;
    this._retryDelay = Math.min(this._retryDelay * 1.5, 30000); // cap at 30s
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      this.connect(this._displayName, this._deviceType);
    }, delay);
  }

  handleMessage(msg) {
    if (msg.type === 'users') {
      this.bus.emit('users:discovered', msg.payload);
      window.dispatchEvent(new CustomEvent('webdrop:users_discovered', { detail: msg.payload }));
    } else if (msg.type === 'profile_update') {
      this.bus.emit('profile:update', msg.payload);
      window.dispatchEvent(new CustomEvent('webdrop:profile_update', { detail: msg.payload }));
    } else if (msg.type === 'signal') {
      this.bus.emit('webrtc:signal', msg.payload);
    } else if (msg.type === 'qr_session_created') {
      this.bus.emit('qr:session_created', msg.payload);
      window.dispatchEvent(new CustomEvent('webdrop:qr:session_created', { detail: msg.payload }));
    } else if (msg.type === 'qr_paired') {
      this.bus.emit('qr:paired', msg.payload);
      window.dispatchEvent(new CustomEvent('webdrop:qr:paired', { detail: msg.payload }));
    }
  }

  send(message) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  sendSignal(to, signalData) {
    this.send({ type: 'signal', payload: { to, from: this.clientId, ...signalData } });
  }

  createQrSession(sessionId) {
    return this.send({ type: 'qr_create', payload: { sessionId } });
  }

  joinQrSession(sessionId, targetId) {
    return this.send({ type: 'qr_join', payload: { sessionId, targetId } });
  }

  disconnect() {
    this._closedManually = true;
    clearTimeout(this._retryTimer);
    this._retryTimer = null;
    if (this.socket) this.socket.close();
  }
}
