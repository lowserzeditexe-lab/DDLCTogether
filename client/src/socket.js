import { io } from 'socket.io-client';

// DDLC Together connects to a HARDCODED central server.  When the React
// app is loaded via http://82.64.128.239:8001/ inside the Edge --app=
// window, `window.location.origin` already points there, but we force
// the value explicitly so that local file:// loads (debug) and any
// future packaging route also reach the right host.
const HARDCODED_SERVER = 'http://82.64.128.239:8001';
const FORCED = typeof window !== 'undefined' && window.__DDLC_SERVER__;
const URL = FORCED || HARDCODED_SERVER;

export const socket = io(URL, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => console.log('[socket] connected', socket.id));
socket.on('disconnect', () => console.log('[socket] disconnected'));

export function getUsername() {
  return localStorage.getItem('ddlc_together_username') || '';
}
export function setUsername(name) {
  localStorage.setItem('ddlc_together_username', name);
}
