import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (socket) return socket
  // Same-origin (backend serves the SPA) with cookie-based auth.
  socket = io({
    withCredentials: true,
    transports: ['websocket', 'polling'],
  })
  return socket
}

