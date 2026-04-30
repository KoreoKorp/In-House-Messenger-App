// ============================================================
// JEAN'S MESSENGER — Main Server
// ============================================================
// Named slugs, PIN auth, IP tracking, Discord alerts
// ============================================================
/* eslint-disable security/detect-object-injection */

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const fs         = require('fs');
const crypto     = require('crypto');

const app    = express();
const server = http.createServer(app);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const io     = new Server(server, { cors: { origin: ALLOWED_ORIGIN } });

// ── Startup Checks ───────────────────────────────────────────
if (!process.env.JEAN_PIN)       { console.error('❌ JEAN_PIN not set');       process.exit(1); }
if (!process.env.ADMIN_PASSWORD) { console.error('❌ ADMIN_PASSWORD not set'); process.exit(1); }

// ── Data Storage ─────────────────────────────────────────────
const DATA_DIR        = path.join(__dirname, 'data');
const CONTACTS_FILE   = path.join(DATA_DIR, 'contacts.json');
const MESSAGES_DIR    = path.join(DATA_DIR, 'messages');
const ALERTS_FILE     = path.join(DATA_DIR, 'alerts.json');
const LAUNCHER_FILE   = path.join(DATA_DIR, 'launcher.json');

if (!fs.existsSync(DATA_DIR))      fs.mkdirSync(DATA_DIR,     { recursive: true });
if (!fs.existsSync(MESSAGES_DIR))  fs.mkdirSync(MESSAGES_DIR, { recursive: true });
if (!fs.existsSync(CONTACTS_FILE)) fs.writeFileSync(CONTACTS_FILE, '[]');
if (!fs.existsSync(ALERTS_FILE))   fs.writeFileSync(ALERTS_FILE,   '[]');

// TOFU launcher auth — first registration wins; subsequent must match
function getLauncherToken() {
  try { return JSON.parse(fs.readFileSync(LAUNCHER_FILE, 'utf8')).authToken || null; } catch { return null; }
}
function saveLauncherToken(token) {
  fs.writeFileSync(LAUNCHER_FILE, JSON.stringify({ authToken: token }));
}

// ── Contact Helpers ───────────────────────────────────────────
function getContacts() {
  try { return JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8')); } catch { return []; }
}
function saveContacts(c) { fs.writeFileSync(CONTACTS_FILE, JSON.stringify(c, null, 2)); }

// Look up by slug (human-readable URL) first, then legacy hex roomId
function findContact(identifier) {
  return getContacts().find(c => (c.slug && c.slug === identifier) || c.roomId === identifier) || null;
}

// ── Message Helpers ───────────────────────────────────────────
function getMessages(roomId) {
  const safe = roomId.replace(/[^a-f0-9]/gi, '');
  const file = path.join(MESSAGES_DIR, `${safe}.json`);
  if (!fs.existsSync(file)) return [];
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
}
function saveMessage(roomId, message) {
  const safe     = roomId.replace(/[^a-f0-9]/gi, '');
  const file     = path.join(MESSAGES_DIR, `${safe}.json`);
  const messages = getMessages(roomId);
  messages.push(message);
  fs.writeFileSync(file, JSON.stringify(messages.slice(-500), null, 2));
  return message;
}
function markRoomAsRead(roomId) {
  const safe = roomId.replace(/[^a-f0-9]/gi, '');
  const file = path.join(MESSAGES_DIR, `${safe}.json`);
  if (!fs.existsSync(file)) return;
  fs.writeFileSync(file, JSON.stringify(getMessages(roomId).map(m => ({ ...m, readByJean: true })), null, 2));
}

// ── Alert Helpers ─────────────────────────────────────────────
function getAlerts() {
  try { return JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8')); } catch { return []; }
}
function saveAlerts(a) { fs.writeFileSync(ALERTS_FILE, JSON.stringify(a, null, 2)); }
function addAlert(data) {
  const alert = { id: crypto.randomBytes(4).toString('hex'), ...data, timestamp: new Date().toISOString() };
  const alerts = getAlerts();
  alerts.unshift(alert);
  saveAlerts(alerts.slice(0, 100));
  return alert;
}

// ── Discord Webhook ───────────────────────────────────────────
async function sendDiscordAlert(contactName, knownIP, newIP) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title:       '⚠️ Security Alert — Jean\'s Messenger',
          description: `**${contactName}** connected from a new IP address.\n\n` +
                       `**Known IP:** \`${knownIP}\`\n` +
                       `**New IP:** \`${newIP}\`\n\n` +
                       `They have been **allowed through**. If this wasn't ${contactName}, open the admin panel → find their contact → click **Clear IP** to force re-verification on their next visit.`,
          color:     0xFF4444,
          timestamp: new Date().toISOString()
        }]
      })
    });
  } catch (e) { console.error('Discord webhook failed:', e.message); }
}

// ── PIN Rate Limiting ─────────────────────────────────────────
// Max 10 wrong attempts per IP within a 15-minute window
const pinAttempts = new Map();
function checkPinRateLimit(ip) {
  const now    = Date.now();
  const record = pinAttempts.get(ip) || { count: 0, since: now };
  if (now - record.since > 15 * 60 * 1000) {
    pinAttempts.set(ip, { count: 1, since: now });
    return true;
  }
  if (record.count >= 10) return false;
  record.count++;
  pinAttempts.set(ip, record);
  return true;
}

// ── Middleware ────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key, x-jean-pin, x-session-token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── Page Routes ───────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ ok: true }));
app.get('/',          (_, res) => res.sendFile(path.join(__dirname, 'public', 'jean.html')));
app.get('/jean',      (_, res) => res.sendFile(path.join(__dirname, 'public', 'jean.html')));
app.get('/admin',     (_, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/chat',      (_, res) => res.sendFile(path.join(__dirname, 'public', 'jean.html')));
app.get('/chat/:id',  (_, res) => res.sendFile(path.join(__dirname, 'public', 'family.html')));

// ── API: Contacts ─────────────────────────────────────────────
app.get('/api/contacts', requireAdmin, (req, res) => res.json(getContacts()));

app.post('/api/contacts', requireAdmin, (req, res) => {
  const { name, phone, slug, pin } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  const contacts  = getContacts();
  const cleanSlug = (slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

  if (contacts.some(c => c.name.toLowerCase() === name.trim().toLowerCase()))
    return res.status(400).json({ error: 'A contact with that name already exists' });
  if (cleanSlug && contacts.some(c => c.slug === cleanSlug))
    return res.status(400).json({ error: 'That URL name is already taken' });

  const contact = {
    id:           crypto.randomBytes(4).toString('hex'),
    name:         name.trim(),
    phone:        (phone || '').replace(/[^0-9+\-() ]/g, '').trim(),
    roomId:       crypto.randomBytes(12).toString('hex'),
    slug:         cleanSlug || null,
    pin:          pin?.trim() || null,
    allowedIP:    null,
    sessionToken: crypto.randomBytes(16).toString('hex'),
    createdAt:    new Date().toISOString()
  };

  contacts.push(contact);
  saveContacts(contacts);
  console.log(`✅ Contact added: ${contact.name}`);
  res.json(contact);
});

// Update contact — slug, PIN, or clear IP
app.put('/api/contacts/:id', requireAdmin, (req, res) => {
  const contacts = getContacts();
  const idx      = contacts.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Contact not found' });

  const { slug, pin, clearIP } = req.body;

  if (slug !== undefined) {
    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (cleanSlug && contacts.some((c, i) => i !== idx && c.slug === cleanSlug))
      return res.status(400).json({ error: 'That URL name is already taken' });
    contacts[idx].slug = cleanSlug || null;
  }

  if (pin !== undefined) {
    contacts[idx].pin = pin.trim() || null;
    // Changing the PIN invalidates all existing device sessions
    contacts[idx].sessionToken = crypto.randomBytes(16).toString('hex');
  }

  if (clearIP) {
    contacts[idx].allowedIP = null;
    console.log(`🔓 IP cleared for ${contacts[idx].name}`);
  }

  // Ensure legacy contacts get a sessionToken if they didn't have one
  if (!contacts[idx].sessionToken) {
    contacts[idx].sessionToken = crypto.randomBytes(16).toString('hex');
  }

  saveContacts(contacts);
  console.log(`✏️  Contact updated: ${contacts[idx].name}`);
  res.json(contacts[idx]);
});

app.delete('/api/contacts/:id', requireAdmin, (req, res) => {
  const contacts = getContacts();
  const contact  = contacts.find(c => c.id === req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  saveContacts(contacts.filter(c => c.id !== req.params.id));
  console.log(`🗑️  Contact removed: ${contact.name}`);
  res.json({ success: true });
});

// ── API: Alerts ───────────────────────────────────────────────
app.get('/api/alerts',           requireAdmin, (req, res) => res.json(getAlerts()));
app.delete('/api/alerts',        requireAdmin, (req, res) => { saveAlerts([]); res.json({ success: true }); });
app.delete('/api/alerts/:id',    requireAdmin, (req, res) => {
  saveAlerts(getAlerts().filter(a => a.id !== req.params.id));
  res.json({ success: true });
});

// ── API: TURN Credentials ─────────────────────────────────────
app.get('/api/turn', requireAdmin, (req, res) => {
  const { TURN_URL, TURN_USERNAME, TURN_CREDENTIAL } = process.env;
  if (!TURN_URL && !TURN_USERNAME && !TURN_CREDENTIAL) return res.json({ iceServers: [] });
  res.json({ turnUrl: TURN_URL, turnUsername: TURN_USERNAME, turnCredential: TURN_CREDENTIAL,
    iceServers: [{ urls: `turn:${TURN_URL}`, username: TURN_USERNAME, credential: TURN_CREDENTIAL }] });
});

// ── API: System Report via SMS ────────────────────────────────
app.post('/send-sys-report', requireAdmin, async (req, res) => {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from, CAREGIVER_PHONE: to } = process.env;
  if (!sid || !token || !from || !to) { console.warn('⚠️  Twilio not configured — skipping SMS'); return res.json({ ok: false, reason: 'Twilio not configured' }); }
  const { message } = req.body;
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: from, Body: message }).toString()
    });
    if (!r.ok) { const e = await r.json(); return res.json({ ok: false, reason: e.message || r.statusText }); }
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, reason: e.message }); }
});

// ── API: Room / Messages ──────────────────────────────────────
app.get('/api/room/:id', (req, res) => {
  const contact = findContact(req.params.id);
  if (!contact) return res.status(404).json({ error: 'This chat link is not valid or has been removed.' });
  res.json({ name: contact.name, roomId: contact.roomId, requiresPin: !!contact.pin });
});

app.get('/api/messages/:id', (req, res) => {
  const contact = findContact(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Invalid room' });

  // Admin key or a valid session token from the contact's device
  const adminKey = req.headers['x-admin-key'];
  const sessionToken = req.headers['x-session-token'];
  const jeanPin = req.headers['x-jean-pin'];

  const isAdmin   = adminKey && adminKey === process.env.ADMIN_PASSWORD;
  const isFamily  = sessionToken && sessionToken === contact.sessionToken;
  const isJean    = jeanPin && jeanPin === process.env.JEAN_PIN;

  if (!isAdmin && !isFamily && !isJean) return res.status(401).json({ error: 'Unauthorized' });

  res.json(getMessages(contact.roomId));
});

// Jean's sidebar — all rooms with unread counts
app.get('/api/jean/rooms', (req, res) => {
  const pin = req.headers['x-jean-pin'];
  if (!pin || pin !== process.env.JEAN_PIN) return res.status(401).json({ error: 'Unauthorized' });

  const rooms = getContacts().map(contact => {
    const messages    = getMessages(contact.roomId);
    const lastMessage = messages[messages.length - 1] || null;
    const unread      = messages.filter(m => m.from === 'family' && !m.readByJean).length;
    return { ...contact, lastMessage, unread };
  });
  rooms.sort((a, b) => b.unread - a.unread);
  res.json(rooms);
});

// ── Socket.io ─────────────────────────────────────────────────
let jeanSocket     = null;
let launcherSocket = null;
let adminSocket    = null;

io.on('connection', (socket) => {

  // ── Jean ───────────────────────────────────────────────────
  socket.on('jean-connect', ({ pin }) => {
    if (pin !== process.env.JEAN_PIN) { socket.emit('auth-error', 'Wrong PIN. Please try again.'); return; }
    if (jeanSocket && jeanSocket.id !== socket.id)
      jeanSocket.emit('session-replaced', 'You opened Jean\'s chat in another window.');
    jeanSocket = socket; socket.isJean = true;
    console.log('👵 Jean is online');
    socket.emit('jean-authenticated');
    io.emit('jean-status', { online: true });
  });

  // ── Family Member ──────────────────────────────────────────
  socket.on('family-connect', async ({ roomId, pin, token }) => {
    const contact = findContact(roomId);
    if (!contact) { socket.emit('auth-error', 'This chat link is not valid or has been removed.'); return; }

    const clientIP = ((socket.handshake.headers['x-forwarded-for'] || '').split(',')[0].trim())
      || socket.handshake.address;

    // ── PIN / Token Auth ─────────────────────────────────
    if (contact.pin) {
      if (token) {
        // Returning device — validate session token
        if (token !== contact.sessionToken) {
          socket.emit('auth-error', 'Your session has expired. Please enter your PIN again.');
          return;
        }
      } else if (pin) {
        // New device — validate PIN
        if (!checkPinRateLimit(clientIP)) {
          socket.emit('auth-error', 'Too many attempts. Please wait 15 minutes and try again.');
          return;
        }
        if (pin !== contact.pin) {
          socket.emit('auth-error', 'Incorrect PIN. Please try again.');
          return;
        }
        // Correct — send session token for device storage
        socket.emit('auth-token', { token: contact.sessionToken });
      } else {
        socket.emit('pin-required');
        return;
      }
    }

    // ── IP Check ─────────────────────────────────────────
    const contacts = getContacts();
    const idx      = contacts.findIndex(c => c.id === contact.id);
    if (idx !== -1) {
      if (!contacts[idx].allowedIP) {
        // First visit — register their IP
        contacts[idx].allowedIP = clientIP;
        saveContacts(contacts);
        console.log(`📍 IP registered for ${contact.name}: ${clientIP}`);
      } else if (contacts[idx].allowedIP !== clientIP) {
        // IP changed — let them through but alert
        console.log(`⚠️  IP mismatch for ${contact.name}: ${contacts[idx].allowedIP} → ${clientIP}`);
        const alert = addAlert({
          type: 'ip-change', contactName: contact.name, contactId: contact.id,
          knownIP: contacts[idx].allowedIP, newIP: clientIP
        });
        sendDiscordAlert(contact.name, contacts[idx].allowedIP, clientIP).catch(() => {});
        if (adminSocket) adminSocket.emit('security-alert', alert);
      }
    }

    // ── Join Room ─────────────────────────────────────────
    socket.roomId  = contact.roomId;
    socket.contact = contact;
    socket.join(contact.roomId);
    console.log(`👤 ${contact.name} is online`);
    socket.emit('family-authenticated', { name: contact.name });
    if (jeanSocket) jeanSocket.emit('contact-online', { roomId: contact.roomId, name: contact.name });
  });

  // ── Admin Panel ────────────────────────────────────────────
  socket.on('admin-connect', ({ password }) => {
    if (password !== process.env.ADMIN_PASSWORD) return;
    adminSocket = socket; socket.isAdmin = true;
    // Push any pending alerts immediately
    socket.emit('alerts-update', getAlerts());
  });

  // ── Jean: send message ─────────────────────────────────────
  socket.on('jean-message', ({ roomId, text }) => {
    if (!socket.isJean || !text?.trim()) return;
    const message = { id: crypto.randomBytes(6).toString('hex'), from: 'jean', name: 'Jean', text: text.trim(), timestamp: new Date().toISOString() };
    saveMessage(roomId, message);
    socket.to(roomId).emit('new-message', { roomId, message });
    socket.emit('message-sent', { roomId, message });
  });

  // ── Jean: broadcast to all ─────────────────────────────────
  socket.on('jean-broadcast', ({ text }) => {
    if (!socket.isJean || !text?.trim()) return;
    const contacts = getContacts();
    contacts.forEach(contact => {
      const message = { id: crypto.randomBytes(6).toString('hex'), from: 'jean', name: 'Jean', text: text.trim(), timestamp: new Date().toISOString(), broadcast: true };
      saveMessage(contact.roomId, message);
      socket.to(contact.roomId).emit('new-message', { roomId: contact.roomId, message });
    });
    socket.emit('broadcast-sent', { text, count: contacts.length });
    console.log(`📢 Jean broadcast to ${contacts.length} contacts`);
  });

  // ── Family: send message ───────────────────────────────────
  socket.on('family-message', ({ text }) => {
    if (!socket.roomId || !text?.trim()) return;
    const message = { id: crypto.randomBytes(6).toString('hex'), from: 'family', name: socket.contact.name, text: text.trim(), timestamp: new Date().toISOString(), readByJean: false };
    saveMessage(socket.roomId, message);
    if (jeanSocket) jeanSocket.emit('new-message', { roomId: socket.roomId, message });
    socket.emit('message-sent', message);
  });

  // ── Jean: open room (mark read) ────────────────────────────
  socket.on('jean-open-room', ({ roomId }) => {
    if (!socket.isJean) return;
    markRoomAsRead(roomId);
    socket.to(roomId).emit('jean-read');
  });

  // ── Typing indicators ──────────────────────────────────────
  socket.on('typing-start', () => {
    if (socket.isJean || !socket.roomId || !jeanSocket) return;
    jeanSocket.emit('contact-typing', { roomId: socket.roomId, name: socket.contact.name });
  });
  socket.on('typing-stop', () => {
    if (socket.isJean || !socket.roomId || !jeanSocket) return;
    jeanSocket.emit('contact-stopped-typing', { roomId: socket.roomId });
  });
  socket.on('jean-typing', ({ roomId }) => { if (!socket.isJean) return; socket.to(roomId).emit('jean-typing'); });
  socket.on('jean-stopped-typing', ({ roomId }) => { if (!socket.isJean) return; socket.to(roomId).emit('jean-stopped-typing'); });

  // ── Launcher registration ──────────────────────────────────
  socket.on('register', ({ deviceId, authToken }) => {
    const storedToken = getLauncherToken();
    if (storedToken) {
      // Token already registered — must match
      if (authToken !== storedToken) {
        socket.emit('auth-error', 'Launcher token mismatch. Reset launcher.json on the server to re-pair.');
        console.warn('🛑 Launcher registration rejected — token mismatch');
        return;
      }
    } else {
      // First connection — trust and persist (TOFU)
      if (authToken) saveLauncherToken(authToken);
      console.log(`🖥️  Launcher token registered (TOFU, device: ${deviceId})`);
    }
    launcherSocket = socket; socket.isLauncher = true;
    console.log(`🖥️  Launcher registered (device: ${deviceId})`);
  });

  // ── Video call: family initiates ───────────────────────────
  socket.on('call-jean', ({ offer }) => {
    if (!socket.roomId || !socket.contact) return;
    if (!launcherSocket) { socket.emit('call-failed', { reason: 'Jean\'s device is not connected.' }); return; }
    console.log(`📞 ${socket.contact.name} is calling Jean`);
    launcherSocket.emit('incoming-video-call', { from: socket.id, callerName: socket.contact.name, offer });
  });

  socket.on('call-answer', ({ to, answer }) => {
    if (!socket.isLauncher) return;
    io.to(to).emit('call-answered', { answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    if (socket.isLauncher) io.to(to).emit('ice-candidate', { from: socket.id, candidate });
    else if (launcherSocket) launcherSocket.emit('ice-candidate', { from: socket.id, candidate });
  });

  socket.on('call-ended', ({ to }) => {
    if (socket.isLauncher && to) io.to(to).emit('call-ended', { from: socket.id });
    else if (launcherSocket) launcherSocket.emit('call-ended', { from: socket.id });
    console.log('📵 Call ended');
  });

  socket.on('call-declined', ({ to }) => { io.to(to).emit('call-declined', { from: socket.id }); });

  // ── Disconnect ─────────────────────────────────────────────
  socket.on('disconnect', () => {
    if (socket.isJean)          { jeanSocket = null;     console.log('👵 Jean went offline'); io.emit('jean-status', { online: false }); }
    else if (socket.isLauncher) { launcherSocket = null;  console.log('🖥️  Launcher disconnected'); }
    else if (socket.isAdmin)    { adminSocket = null; }
    else if (socket.roomId)     {
      console.log(`👤 ${socket.contact?.name} went offline`);
      if (jeanSocket) jeanSocket.emit('contact-offline', { roomId: socket.roomId });
    }
  });
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('💬 Jean\'s Messenger is running!');
  console.log(`   Jean's page:  http://localhost:${PORT}/`);
  console.log(`   Admin panel:  http://localhost:${PORT}/admin`);
  console.log('');
});
