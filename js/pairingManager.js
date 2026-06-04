import { DeviceDetector } from './deviceDetector.js';

export class PairingManager {
  constructor(bus) {
    this.bus = bus;
    this.mode = null;
  }

  determineMode(remoteDeviceType) {
    const localDeviceType = DeviceDetector.getDeviceType();
    if (localDeviceType === 'iPhone' && remoteDeviceType === 'iPhone') {
      return 'QR';
    } else if (['iPhone', 'Android'].includes(localDeviceType) || ['iPhone', 'Android'].includes(remoteDeviceType)) {
      return 'Touch-to-Transfer';
    } else {
      return 'Manual';
    }
  }

  initiatePairing(user) {
    this.mode = this.determineMode(user.deviceType);
    
    if (this.mode === 'QR') {
      this.bus.emit('qr:initiate', user);
    } else if (this.mode === 'Touch-to-Transfer') {
      this.bus.emit('touch:initiate', user);
    } else {
      // Fallback
      this.bus.emit('manual:initiate', user);
    }
  }
}
