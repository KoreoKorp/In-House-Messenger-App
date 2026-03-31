// ============================================================
// JEAN'S MESSENGER — Main Server
// ============================================================
// Real-time private chat app connecting Jean with her family.
// Each family member gets their own private conversation link.
// Messages are saved to disk so nothing is ever lost.
//
// PAGES:
//   /           → Jean's chat interface (PIN protected)
//   /admin      → Admin panel (manage contacts, get links)
//   /chat/:id   → Family member's private chat page
// ============================================================

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const fs         = require('fs');
const crypto     = require('crypto');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  // Allow connections from any origin (needed when behind a reverse proxy)
  cors: { origin: '*' }
});

// ── Startup Checks ───────────────────────────────────────────
if (!process.env.JEAN_PIN) {
  console.error('❌ ERROR: JEAN_PIN is not set in your .env file!');
  process.exit(1);
}
if (!process.env.ADMIN_PASSWORD) {
  console.error('❌ ERROR: ADMIN_PASSWORD is not set in your .env file!');
  process.exit(1);
}

// ── Data Storage Setup ───────────────────────────────────────
// All data is stored as simple JSON files on disk.
// No database needed — easy to back up and understand.

const DATA_DIR      = path.join(__dirname, 'data');
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json');
const MESSAGES_DIR  = path.join(DATA_DIR, 'messages');

// Create storage folders if they don't exist yet
if (!fs.existsSync(DATA_DIR))     fs.mkdirSync(DATA_DIR,     { recursive: true });
if (!fs.existsSync(MESSAGES_DIR)) fs.mkdirSync(MESSAGES_DIR, { recursive: true });
if (!fs.existsSync(CONTACTS_FILE)) fs.writeFileSync(CONTACTS_FILE, '[]');

// ── Data Helper Functions ────────────────────────────────────

function getContacts() {
  try {
    return JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveContacts(contacts) {
  fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2));
}

function getMessages(roomId) {
  // Sanitize roomId to prevent path traversal attacks
  const safe = roomId.replace(/[^a-f0-9]/gi, '');
  const file = path.join(MESSAGES_DIR, `${safe}.json`);
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function saveMessage(roomId, message) {
  const safe     = roomId.replace(/[^a-f0-9]/gi, '');
  const file     = path.join(MESSAGES_DIR, `${safe}.json`);
  const messages = getMessages(roomId);
  messages.push(message);
  // Keep the most recent 500 messages per conversation
  fs.writeFileSync(file, JSON.stringify(messages.slice(-500), null, 2));
  return message;
}

function markRoomAsRead(roomId) {
  const safe = roomId.replace(/[^a-f0-9]/gi, '');
  const file = path.join(MESSAGES_DIR, `${safe}.json`);
  if (!fs.existsSync(file)) return;
  const messages = getMessages(roomId);
  const updated  = messages.map(m => ({ ...m, readByJean: true }));
  fs.writeFileSync(file, JSON.stringify(updated, null, 2));
}

// ── Express Middleware ───────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Admin authentication — checks for the admin password
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (!key || key !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Page Routes ──────────────────────────────────────────────

// Jean's interface (root and /jean both work)
app.get('/',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'jean.html')));
app.get('/jean', (req, res) => res.sendFile(path.join(__dirname, 'public', 'jean.html')));

// Admin panel
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// Family member's private chat page
app.get('/chat/:roomId', (req, res) => res.sendFile(path.join(__dirname, 'public', 'family.html')));

// ── API: Contact Management ──────────────────────────────────

// List all contacts (admin only)
app.get('/api/contacts', requireAdmin, (req, res) => {
  res.json(getContacts());
});

// Add a new contact (admin only)
app.post('/api/contacts', requireAdmin, (req, res) => {
  const { name, phone } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const contacts = getContacts();

  // Prevent duplicate names
  if (contacts.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) {
    return res.status(400).json({ error: 'A contact with that name already exists' });
  }

  const contact = {
    id:        crypto.randomBytes(4).toString('hex'),
    name:      name.trim(),
    phone:     (phone || '').replace(/[^0-9+\-() ]/g, '').trim(),
    roomId:    crypto.randomBytes(12).toString('hex'), // Their unique secret token
    createdAt: new Date().toISOString()
  };

  contacts.push(contact);
  saveContacts(contacts);

  console.log(`✅ Contact added: ${contact.name}`);
  res.json(contact);
});

// Delete a contact (admin only)
app.delete('/api/contacts/:id', requireAdmin, (req, res) => {
  const contacts = getContacts();
  const contact  = contacts.find(c => c.id === req.params.id);

  if (!contact) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  saveContacts(contacts.filter(c => c.id !== req.params.id));
  console.log(`🗑️  Contact removed: ${contact.name}`);
  res.json({ success: true });
});

// ── API: Chat Data ───────────────────────────────────────────

// Validate a room link — called when family member first opens their link
app.get('/api/room/:roomId', (req, res) => {
  const contact = getContacts().find(c => c.roomId === req.params.roomId);
  if (!contact) {
    return res.status(404).json({ error: 'This chat link is not valid or has been removed.' });
  }
  // Only send back safe info — not the whole contact record
  res.json({ name: contact.name, roomId: contact.roomId });
});

// Get message history for a room
app.get('/api/messages/:roomId', (req, res) => {
  const contact = getContacts().find(c => c.roomId === req.params.roomId);
  if (!contact) {
    return res.status(404).json({ error: 'Invalid room' });
  }
  res.json(getMessages(req.params.roomId));
});

// Get Jean's contact list with unread counts (for her sidebar)
app.get('/api/jean/rooms', (req, res) => {
  const pin = req.headers['x-jean-pin'] || req.query.pin;
  if (!pin || pin !== process.env.JEAN_PIN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const contacts = getContacts();
  const rooms = contacts.map(contact => {
    const messages    = getMessages(contact.roomId);
    const lastMessage = messages[messages.length - 1] || null;
    const unread      = messages.filter(m => m.from === 'family' && !m.readByJean).length;
    return { ...contact, lastMessage, unread };
  });

  // Sort: contacts with unread messages first
  rooms.sort((a, b) => b.unread - a.unread);
  res.json(rooms);
});

// ── Socket.io: Real-Time Messaging ──────────────────────────

let jeanSocket = null; // Tracks Jean's live connection

io.on('connection', (socket) => {

  // ── Jean Logs In ───────────────────────────────────────────
  socket.on('jean-connect', ({ pin }) => {
    if (pin !== process.env.JEAN_PIN) {
      socket.emit('auth-error', 'Wrong PIN. Please try again.');
      return;
    }
    // If Jean was already connected somewhere, disconnect the old session
    if (jeanSocket && jeanSocket.id !== socket.id) {
      jeanSocket.emit('session-replaced', 'You opened Jean\'s chat in another window.');
    }

    jeanSocket    = socket;
    socket.isJean = true;

    console.log('👵 Jean is online');
    socket.emit('jean-authenticated');
    io.emit('jean-status', { online: true }); // Tell all family members Jean is online
  });

  // ── Family Member Opens Their Link ─────────────────────────
  socket.on('family-connect', ({ roomId }) => {
    const contact = getContacts().find(c => c.roomId === roomId);
    if (!contact) {
      socket.emit('auth-error', 'This chat link is not valid or has been removed.');
      return;
    }

    socket.roomId   = roomId;
    socket.contact  = contact;
    socket.join(roomId); // Join the private room for this conversation

    console.log(`👤 ${contact.name} is online`);
    socket.emit('family-authenticated', { name: contact.name });

    // Tell Jean this person came online
    if (jeanSocket) {
      jeanSocket.emit('contact-online', { roomId, name: contact.name });
    }
  });

  // ── Jean Sends a Message to One Person ─────────────────────
  socket.on('jean-message', ({ roomId, text }) => {
    if (!socket.isJean || !text?.trim()) return;

    const message = {
      id:        crypto.randomBytes(6).toString('hex'),
      from:      'jean',
      name:      'Jean',
      text:      text.trim(),
      timestamp: new Date().toISOString()
    };

    saveMessage(roomId, message);
    socket.to(roomId).emit('new-message', { roomId, message }); // Deliver to family member
    socket.emit('message-sent', { roomId, message });            // Confirm to Jean
  });

  // ── Jean Broadcasts to EVERYONE ────────────────────────────
  // Used for "I need help!" and other alerts to all contacts at once
  socket.on('jean-broadcast', ({ text }) => {
    if (!socket.isJean || !text?.trim()) return;

    const contacts = getContacts();
    contacts.forEach(contact => {
      const message = {
        id:        crypto.randomBytes(6).toString('hex'),
        from:      'jean',
        name:      'Jean',
        text:      text.trim(),
        timestamp: new Date().toISOString(),
        broadcast: true
      };
      saveMessage(contact.roomId, message);
      socket.to(contact.roomId).emit('new-message', { roomId: contact.roomId, message });
    });

    socket.emit('broadcast-sent', { text, count: contacts.length });
    console.log(`📢 Jean broadcast to ${contacts.length} contacts: "${text}"`);
  });

  // ── Family Member Sends a Message to Jean ──────────────────
  socket.on('family-message', ({ text }) => {
    if (!socket.roomId || !text?.trim()) return;

    const message = {
      id:         crypto.randomBytes(6).toString('hex'),
      from:       'family',
      name:       socket.contact.name,
      text:       text.trim(),
      timestamp:  new Date().toISOString(),
      readByJean: false
    };

    saveMessage(socket.roomId, message);

    // Deliver to Jean if she's online
    if (jeanSocket) {
      jeanSocket.emit('new-message', { roomId: socket.roomId, message });
    }

    socket.emit('message-sent', message); // Confirm to sender
  });

  // ── Jean Opens a Conversation (Mark as Read) ───────────────
  socket.on('jean-open-room', ({ roomId }) => {
    if (!socket.isJean) return;
    markRoomAsRead(roomId);
    // Tell that family member Jean has seen their messages
    socket.to(roomId).emit('jean-read');
  });

  // ── Typing Indicators ──────────────────────────────────────
  socket.on('typing-start', () => {
    if (socket.isJean) return; // Jean's typing is sent via 'jean-typing' event
    if (!socket.roomId || !jeanSocket) return;
    jeanSocket.emit('contact-typing', { roomId: socket.roomId, name: socket.contact.name });
  });

  socket.on('typing-stop', () => {
    if (socket.isJean) return;
    if (!socket.roomId || !jeanSocket) return;
    jeanSocket.emit('contact-stopped-typing', { roomId: socket.roomId });
  });

  socket.on('jean-typing', ({ roomId }) => {
    if (!socket.isJean) return;
    socket.to(roomId).emit('jean-typing');
  });

  socket.on('jean-stopped-typing', ({ roomId }) => {
    if (!socket.isJean) return;
    socket.to(roomId).emit('jean-stopped-typing');
  });

  // ── Disconnect ─────────────────────────────────────────────
  socket.on('disconnect', () => {
    if (socket.isJean) {
      jeanSocket = null;
      console.log('👵 Jean went offline');
      io.emit('jean-status', { online: false });
    } else if (socket.roomId) {
      console.log(`👤 ${socket.contact?.name} went offline`);
      if (jeanSocket) {
        jeanSocket.emit('contact-offline', { roomId: socket.roomId });
      }
    }
  });

});

// ── Start the Server ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log('');
  console.log("💬 Jean's Messenger is running!");
  console.log(`   Jean's page:  http://localhost:${PORT}/`);
  console.log(`   Admin panel:  http://localhost:${PORT}/admin`);
  console.log('');
});
