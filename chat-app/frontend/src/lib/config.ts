export const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

// If running locally, we might need to point to the specific port if not served from it
export const apiBaseUrl = isLocalDev 
  ? (window.location.port === '5173' || window.location.port === '3000' || window.location.port === '' 
      ? 'http://localhost:8787' 
      : '') 
  : '';

export const getPlatform = () => {
  let platform = 'web';
  const ua = navigator.userAgent.toLowerCase();
  if (/ipad/.test(ua)) platform = 'ios-ipad';
  else if (/iphone|ipod/.test(ua)) platform = 'ios-iphone';
  else if (/android/.test(ua)) {
    if (/mobile/.test(ua)) platform = 'android-phone';
    else platform = 'android-tablet';
  }
  return platform;
};

export const getWsUrl = (username: string, channelId: number) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const platform = getPlatform();
  // In dev mode (Vite), we usually need to point to the backend port explicitly
  const host = isLocalDev ? 'localhost:8787' : window.location.host;
  return `${protocol}//${host}/ws?username=${encodeURIComponent(username)}&channelId=${channelId}&platform=${platform}`;
};
