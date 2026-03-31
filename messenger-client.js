// ============================================================
// MESSENGER CLIENT — Drop this file into any of your other apps!
// ============================================================
// This is a helper module that makes it easy to send texts
// from The Grandma Launcher (or any other app you build).
//
// HOW TO USE:
//   1. Copy this file into your other project folder.
//   2. Set the two config values below (or use environment variables).
//   3. Import and call it wherever you need to send a message.
//
// EXAMPLE:
//   const messenger = require('./messenger-client');
//   await messenger.sendText('+15558675309', 'Grandma pressed the button!');
// ============================================================

// ── Configuration ───────────────────────────────────────────
// Option A: Hard-code your values here (easier for beginners)
// Option B: Use environment variables (safer — see .env.example)

const MESSENGER_URL = process.env.MESSENGER_URL || 'https://your-app.railway.app';
const API_KEY       = process.env.MESSENGER_API_KEY || 'your_api_key_here';

// ── Core: Make a request to the Messenger API ───────────────
async function callMessengerApi(endpoint, body) {
  // We use the built-in fetch (available in Node 18+)
  const response = await fetch(`${MESSENGER_URL}${endpoint}`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key':    API_KEY
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  // If something went wrong, throw a helpful error
  if (!response.ok || !data.success) {
    const message = data.error || data.errors?.join(', ') || 'Unknown error';
    throw new Error(`Messenger API error: ${message}`);
  }

  return data;
}

// ── sendText(to, message) ───────────────────────────────────
// Send a single text message to one phone number.
//
// Parameters:
//   to      — phone number string, e.g. "+15558675309" or "555-867-5309"
//   message — the text to send (up to 1600 characters)
//
// Returns: { success, messageSid, to, status }
//
// Example:
//   await messenger.sendText('+15558675309', 'Help is on the way, Grandma!');
//
async function sendText(to, message) {
  console.log(`📱 Sending SMS to ${to}...`);
  const result = await callMessengerApi('/send-sms', { to, message });
  console.log(`✅ SMS sent! SID: ${result.messageSid}`);
  return result;
}

// ── sendBulkText(numbers, message) ─────────────────────────
// Send the same message to multiple phone numbers at once.
//
// Parameters:
//   numbers — array of phone number strings
//   message — the text to send
//
// Returns: { success, sent, failed, results }
//
// Example:
//   await messenger.sendBulkText(
//     ['+15558675309', '+15551234567'],
//     'Grandma needs help at 123 Main St!'
//   );
//
async function sendBulkText(numbers, message) {
  console.log(`📱 Sending bulk SMS to ${numbers.length} numbers...`);
  const result = await callMessengerApi('/send-bulk', { numbers, message });
  console.log(`✅ Bulk SMS done: ${result.sent} sent, ${result.failed} failed`);
  return result;
}

// ── checkStatus() ───────────────────────────────────────────
// Check if the Messenger API is online and reachable.
// Good to call when your app starts up.
//
// Returns: true if online, false if not reachable
//
async function checkStatus() {
  try {
    const response = await fetch(`${MESSENGER_URL}/health`);
    const data = await response.json();
    if (data.success) {
      console.log('✅ Messenger API is online');
      return true;
    }
  } catch (err) {
    console.warn('⚠️  Messenger API is not reachable:', err.message);
  }
  return false;
}

// ── Export the functions ────────────────────────────────────
module.exports = {
  sendText,
  sendBulkText,
  checkStatus
};
