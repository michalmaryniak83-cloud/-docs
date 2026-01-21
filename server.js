const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Baza danych w pamięci - synchronizacja localStorage między urządzeniami
const syncData = new Map(); // userId -> { localStorage data }
const activeConnections = new Map(); // socketId -> userId

app.use(express.static('docs'));
app.use(express.json());

// WebSocket - synchronizacja w czasie rzeczywistym
io.on('connection', (socket) => {
  console.log('Nowe połączenie:', socket.id);
  
  // Użytkownik się loguje/rejestruje
  socket.on('user_login', (data) => {
    const { userId, username } = data;
    activeConnections.set(socket.id, userId);
    console.log(`Użytkownik zalogowany: ${username} (${userId})`);
    
    // Wyślij zsynchronizowane dane do użytkownika
    if (syncData.has(userId)) {
      socket.emit('sync_data', syncData.get(userId));
    }
    
    // Powiadom wszystkie sesje tego użytkownika
    notifyUserSessions(userId, 'user_session_update', {
      sessionId: socket.id,
      action: 'connected'
    });
  });
  
  // Synchronizuj localStorage między urządzeniami
  socket.on('sync_request', (data) => {
    const userId = activeConnections.get(socket.id);
    if (!userId) return;
    
    const { key, value, action } = data;
    
    // Zaktualizuj dane w pamięci
    if (!syncData.has(userId)) {
      syncData.set(userId, {});
    }
    
    const userData = syncData.get(userId);
    
    if (action === 'set') {
      userData[key] = value;
    } else if (action === 'remove') {
      delete userData[key];
    } else if (action === 'clear') {
      syncData.set(userId, {});
    }
    
    // Rozgłoś zmianę do wszystkich urządzeń tego użytkownika (oprócz nadawcy)
    notifyUserSessions(userId, 'storage_update', { key, value, action }, socket.id);
  });
  
  // Pobierz pełne dane użytkownika
  socket.on('get_full_sync', () => {
    const userId = activeConnections.get(socket.id);
    if (userId && syncData.has(userId)) {
      socket.emit('full_sync_data', syncData.get(userId));
    }
  });
  
  socket.on('disconnect', () => {
    const userId = activeConnections.get(socket.id);
    if (userId) {
      console.log(`Użytkownik rozłączony: ${userId}`);
      notifyUserSessions(userId, 'user_session_update', {
        sessionId: socket.id,
        action: 'disconnected'
      });
    }
    activeConnections.delete(socket.id);
  });
});

// Powiadom wszystkie sesje użytkownika
function notifyUserSessions(userId, event, data, excludeSocketId = null) {
  activeConnections.forEach((connUserId, socketId) => {
    if (connUserId === userId && socketId !== excludeSocketId) {
      io.to(socketId).emit(event, data);
    }
  });
}

// Główna strona
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`🚀 Serwer działa na porcie ${PORT}`);
  console.log(`📱 Otwórz http://localhost:${PORT} w przeglądarce`);
  console.log(`🔄 Synchronizacja między urządzeniami jest włączona!`);
});
