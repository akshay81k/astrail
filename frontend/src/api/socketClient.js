import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
const SOCKET_NAMESPACE = import.meta.env.VITE_SOCKET_NAMESPACE || '/live';
const SOCKET_PATH = import.meta.env.VITE_SOCKET_PATH || '/socket.io';

let socket = null;

export const getSocket = () => {
  if (!socket) {
    socket = io(`${SOCKET_URL}${SOCKET_NAMESPACE}`, {
      path: SOCKET_PATH,
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });
  }
  return socket;
};
