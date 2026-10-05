const logger = require('../utils/logger');

class LiveHub {
  constructor() {
    this.io = null;
    this.liveNamespace = null;
  }

  init(io) {
    this.io = io;
    this.liveNamespace = io.of('/live');

    this.liveNamespace.on('connection', (socket) => {
      logger.info(`[Socket.IO /live] Client connected: ${socket.id}`);

      socket.on('session:join', ({ sessionId }) => {
        if (!sessionId) return;
        socket.join(sessionId);
        logger.debug(`[Socket.IO /live] Socket ${socket.id} joined session ${sessionId}`);

        // Notify session bridge or request immediate state
        const sessionService = require('../services/sessionService');
        sessionService.getSessionState(sessionId).then(state => {
          socket.emit('session:state', state);
        }).catch(err => {
          logger.warn(`Failed to send initial session state to socket ${socket.id}: ${err.message}`);
        });
      });

      socket.on('session:leave', ({ sessionId }) => {
        if (!sessionId) return;
        socket.leave(sessionId);
        logger.debug(`[Socket.IO /live] Socket ${socket.id} left session ${sessionId}`);
      });

      socket.on('frames:config', ({ sessionId, maxFps, channels }) => {
        logger.debug(`[Socket.IO /live] frames:config received for ${sessionId}: fps=${maxFps}, channels=${channels?.length}`);
      });

      socket.on('disconnect', () => {
        logger.info(`[Socket.IO /live] Client disconnected: ${socket.id}`);
      });
    });
  }

  emitToSession(sessionId, event, payload) {
    if (!this.liveNamespace) return;
    this.liveNamespace.to(sessionId).emit(event, payload);
  }

  emitGlobal(event, payload) {
    if (!this.liveNamespace) return;
    this.liveNamespace.emit(event, payload);
  }
}

module.exports = new LiveHub();
