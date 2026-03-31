// ============================================================
// IN-HOUSE MESSENGER API
// ============================================================
// A simple REST API that sends SMS messages via Twilio.
// Designed to be called from your other apps.
//
// ENDPOINTS:
//   GET  /health       → Check if the server is running
//   POST /send-sms     → Send a text message to a phone number
//   POST /send-bulk    → Send the same message to multiple numbers
// ============================================================

// Load environment variables from the .env file
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const twilio  = require('twilio');

const app = express();

// ── Middleware ──────────────────────────────────────────────
// Allow other apps/websites to call this API
app.use(cors());

// Allow the API to read JSON request bodies
app.use(express.json());

// ── Twilio Setup ────────────────────────────────────────────
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ── API Key Guard ───────────────────────────────────────────
// This function checks that the caller knows the secret API key.
// It runs before any sensitive endpoint.
function requireApiKey(req, res, next) {
  const providedKey = req.headers['x-api-key'];

  if (!providedKey || providedKey !== process.env.API_KEY) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized. Provide a valid API key in the x-api-key header.'
    });
  }

  // Key is correct — continue to the actual endpoint
  next();
}

// ── Helper: Format phone numbers ────────────────────────────
// Ensures numbers are in E.164 format: +1XXXXXXXXXX
// Handles inputs like "555-867-5309" or "5558675309"
function formatPhoneNumber(number) {
  // Strip everything except digits and leading +
  const digits = number.replace(/[^\d+]/g, '');

  // Already has a + prefix — trust it as-is
  if (digits.startsWith('+')) return digits;

  // US/Canada 10-digit number → add +1
  if (digits.length === 10) return `+1${digits}`;

  // 11-digit number starting with 1 → add +
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;

  // Return as-is and let Twilio validate it
  return `+${digits}`;
}

// ── Helper: Validate required fields ───────────────────────
function validateSmsRequest(to, message) {
  const errors = [];
  if (!to)      errors.push('"to" (phone number) is required');
  if (!message) errors.push('"message" is required');
  if (message && message.length > 1600) errors.push('"message" must be 1600 characters or less');
  return errors;
}

// ============================================================
// ENDPOINTS
// ============================================================

// ── GET /health ─────────────────────────────────────────────
// A simple check to confirm the server is alive.
// Your monitoring tools or other apps can ping this.
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status:  'online',
    service: 'In-House Messenger API',
    time:    new Date().toISOString()
  });
});

// ── POST /send-sms ──────────────────────────────────────────
// Send a single SMS message to one phone number.
//
// Request body (JSON):
//   {
//     "to":      "+15558675309",   ← recipient phone number
//     "message": "Hello there!"   ← the text to send
//   }
//
// Required header:
//   x-api-key: your_secret_api_key
//
app.post('/send-sms', requireApiKey, async (req, res) => {
  const { to, message } = req.body;

  // Validate inputs
  const errors = validateSmsRequest(to, message);
  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  const formattedNumber = formatPhoneNumber(to);

  try {
    const result = await twilioClient.messages.create({
      to:   formattedNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
      body: message
    });

    console.log(`✅ SMS sent to ${formattedNumber} | SID: ${result.sid}`);

    res.json({
      success:    true,
      messageSid: result.sid,
      to:         formattedNumber,
      status:     result.status
    });

  } catch (err) {
    console.error(`❌ Failed to send SMS to ${formattedNumber}:`, err.message);

    res.status(500).json({
      success: false,
      error:   err.message,
      code:    err.code  // Twilio error code for debugging
    });
  }
});

// ── POST /send-bulk ─────────────────────────────────────────
// Send the same message to multiple phone numbers at once.
//
// Request body (JSON):
//   {
//     "numbers": ["+15558675309", "+15551234567"],
//     "message": "Hello everyone!"
//   }
//
// Required header:
//   x-api-key: your_secret_api_key
//
app.post('/send-bulk', requireApiKey, async (req, res) => {
  const { numbers, message } = req.body;

  // Validate inputs
  if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
    return res.status(400).json({
      success: false,
      error: '"numbers" must be a non-empty array of phone numbers'
    });
  }
  if (!message) {
    return res.status(400).json({ success: false, error: '"message" is required' });
  }
  if (numbers.length > 100) {
    return res.status(400).json({ success: false, error: 'Maximum 100 numbers per bulk request' });
  }

  // Send to all numbers in parallel
  const results = await Promise.allSettled(
    numbers.map(async (number) => {
      const formatted = formatPhoneNumber(number);
      const msg = await twilioClient.messages.create({
        to:   formatted,
        from: process.env.TWILIO_PHONE_NUMBER,
        body: message
      });
      return { number: formatted, status: 'sent', sid: msg.sid };
    })
  );

  // Summarize what succeeded and what failed
  const summary = results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        number: numbers[i],
        status: 'failed',
        error:  result.reason?.message
      };
    }
  });

  const sent   = summary.filter(r => r.status === 'sent').length;
  const failed = summary.filter(r => r.status === 'failed').length;

  console.log(`📨 Bulk SMS: ${sent} sent, ${failed} failed`);

  res.json({
    success: failed === 0,
    sent,
    failed,
    results: summary
  });
});

// ── 404 Handler ─────────────────────────────────────────────
// Catches requests to routes that don't exist
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error:   `Route not found: ${req.method} ${req.path}`,
    hint:    'Available routes: GET /health | POST /send-sms | POST /send-bulk'
  });
});

// ── Start the Server ────────────────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('');
  console.log('🚀 In-House Messenger API is running!');
  console.log(`   Local address: http://localhost:${PORT}`);
  console.log(`   Health check:  http://localhost:${PORT}/health`);
  console.log('');
});
