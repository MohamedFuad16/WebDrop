export class DeviceDetector {
  static getDeviceType() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
      return 'iPhone';
    }
    if (/android/i.test(userAgent)) {
      return 'Android';
    }
    return 'Desktop';
  }

  static getCapabilities() {
    return {
      hasWebRTC: 'RTCPeerConnection' in window,
      hasDataChannel: 'RTCDataChannel' in window,
      hasWebAudio: !!(window.AudioContext || window.webkitAudioContext),
      hasUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      hasDeviceMotion: 'DeviceMotionEvent' in window,
      hasDeviceOrientation: 'DeviceOrientationEvent' in window,
      isIOS: this.getDeviceType() === 'iPhone'
    };
  }
}
