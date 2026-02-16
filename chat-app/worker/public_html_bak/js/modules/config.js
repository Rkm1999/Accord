export const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// If running locally, we might need to point to the specific port if not served from it
export const apiBaseUrl = isLocalDev ? (window.location.port === '8787' || window.location.port === '' ? '' : 'http://localhost:8787') : '';

export function getPlatform() {
    let platform = 'web';
    const ua = navigator.userAgent.toLowerCase();
    if (/ipad/.test(ua)) platform = 'ios-ipad';
    else if (/iphone|ipod/.test(ua)) platform = 'ios-iphone';
    else if (/android/.test(ua)) {
        if (/mobile/.test(ua)) platform = 'android-phone';
        else platform = 'android-tablet';
    }
    return platform;
}

export function getWsUrl(username, channelId) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const platform = getPlatform();
    // Use window.location.host to match the current serving host/port
    return `${protocol}//${window.location.host}/ws?username=${encodeURIComponent(username)}&channelId=${channelId}&platform=${platform}`;
}

export const CONFIG = {
    isLocalDev,
    apiBaseUrl,
    getPlatform,
    getWsUrl
};
