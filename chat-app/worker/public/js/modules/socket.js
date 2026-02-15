import { getWsUrl } from './config.js';
import { state, updateState } from './state.js';

let ws = null;
let heartbeatInterval = null;
const listeners = new Set();

/**
 * Connects to the WebSocket server.
 */
export function connect(username, currentChannelId) {
    if (ws) {
        ws.onclose = null; // Prevent reconnection loop from old instance
        ws.close();
    }
    
    const wsUrl = getWsUrl(username, currentChannelId);
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        updateState({ isConnected: true });
        console.log('Connected to chat server');
        
        // Start heartbeat
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'heartbeat' }));
            }
        }, 20000);
        
        notifyListeners({ type: 'connected' });
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            notifyListeners(data);
        } catch (e) {
            console.error('Failed to parse WebSocket message:', e);
        }
    };

    ws.onclose = (event) => {
        updateState({ isConnected: false });
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        
        console.log('Disconnected from chat server', event.code, event.reason);
        notifyListeners({ type: 'disconnected', code: event.code, reason: event.reason });
        
        // Auto-reconnect after 3 seconds
        setTimeout(() => connect(username, currentChannelId), 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

/**
 * Sends data through the WebSocket.
 */
export function send(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    } else {
        console.warn('Socket not connected, cannot send:', data);
    }
}

/**
 * Adds a listener for WebSocket messages.
 */
export function addSocketListener(callback) {
    listeners.add(callback);
}

/**
 * Removes a listener.
 */
export function removeSocketListener(callback) {
    listeners.delete(callback);
}

/**
 * Internal helper to notify all registered listeners.
 */
function notifyListeners(data) {
    listeners.forEach(callback => callback(data));
}
