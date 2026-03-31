// ============================================================
// GRANDMA LAUNCHER — Example Integration
// ============================================================
// This shows how The Grandma Launcher can use the Messenger API
// to send texts when Grandma presses a button.
//
// Copy the relevant parts into your actual Grandma Launcher code.
// ============================================================

const messenger = require('./messenger-client');

// ── Example: Family contact list ────────────────────────────
// Put the phone numbers of people to notify here
const FAMILY_CONTACTS = [
  { name: 'Mom',  number: '+15551112222' },
  { name: 'Son',  number: '+15553334444' },
  { name: 'Neighbor Bob', number: '+15555556666' }
];

// ── Example: The button was pressed ─────────────────────────
// Call this function when Grandma presses the launcher button
async function onButtonPressed() {
  console.log('🔴 Grandma pressed the button!');

  const message = 'ALERT: Grandma needs help! Please check on her right away.';

  // Get all the phone numbers from the contact list
  const allNumbers = FAMILY_CONTACTS.map(contact => contact.number);

  try {
    // Send to everyone at once
    const result = await messenger.sendBulkText(allNumbers, message);

    if (result.success) {
      console.log(`✅ Alert sent to all ${result.sent} family members!`);
    } else {
      console.log(`⚠️  Alert sent to ${result.sent} people, but failed for ${result.failed}.`);
      // Log which ones failed
      result.results
        .filter(r => r.status === 'failed')
        .forEach(r => console.warn(`  ❌ Failed for ${r.number}: ${r.error}`));
    }
  } catch (err) {
    console.error('❌ Could not send alert:', err.message);
  }
}

// ── Example: Send a custom check-in message ─────────────────
async function sendCheckIn(recipientNumber, customMessage) {
  try {
    await messenger.sendText(recipientNumber, customMessage);
    console.log('✅ Check-in message sent!');
  } catch (err) {
    console.error('❌ Check-in failed:', err.message);
  }
}

// ── Example: App startup check ──────────────────────────────
async function startApp() {
  console.log('🚀 Starting Grandma Launcher...');

  // Make sure the messenger service is reachable
  const messengerOnline = await messenger.checkStatus();

  if (!messengerOnline) {
    console.warn('⚠️  Warning: Messenger API is offline. Texts will not be sent.');
    // You could alert the user here, or retry later
  }

  // ... rest of your Grandma Launcher startup code goes here ...
  console.log('✅ Grandma Launcher ready!');
}

// ── Run the example ─────────────────────────────────────────
// Uncomment the line below to test this file:
// onButtonPressed();
