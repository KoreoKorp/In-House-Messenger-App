# Bulk Import Contacts from VCF

This script imports all contacts from Jean's contact file (VCF format) into the messenger app and generates unique chat links for each person.

## Quick Start

### On Your VPS (Linux)

```bash
# Navigate to the messenger app directory
cd ~/in-house-messenger-app

# Make the import script executable
chmod +x import-contacts.sh

# Run the import with your VCF file
node import-vcf-contacts.js /path/to/Grammie\ Contacts.vcf
```

### Example Output

```
📂 Reading VCF file...

📋 Found 5 contact(s). Starting import...

[1/5] Importing Corey... ✅
[2/5] Importing Alice... ✅
[3/5] Importing Bob... ✅
[4/5] Importing Carol... ✅
[5/5] Importing David... ✅

============================================================
✅ IMPORT COMPLETE
============================================================
Successfully imported: 5/5

📱 Chat Links for Each Contact:
============================================================

Corey
Phone: +17343075021
Link: http://34.132.145.35:3000/chat/a1b2c3d4e5f6g7h8i9j0k1l2

Alice
Phone: +15551234567
Link: http://34.132.145.35:3000/chat/b2c3d4e5f6g7h8i9j0k1l2m3

... (etc for each contact)
```

## How It Works

1. **Parses the VCF file** — Extracts all contacts with names and phone numbers
2. **Creates unique links** — Generates a 24-character hex room ID for each contact
3. **Adds to messenger database** — Makes API calls to add each contact with their unique room
4. **Prints chat links** — Shows the generated links so you can share them with family

## Environment Variables

If your messenger isn't at `localhost:3000`, set these before running:

```bash
export MESSENGER_HOST="34.132.145.35"
export MESSENGER_PORT="3000"
export ADMIN_KEY="your-admin-password"
node import-vcf-contacts.js "Grammie Contacts.vcf"
```

## Troubleshooting

**"Connection refused"** → Messenger API isn't running. Start it with `pm2 start in-house-messenger`

**"Cannot find module"** → Run `npm install` first to install dependencies

**"No valid contacts found"** → VCF file may be empty or corrupted. Try opening it with a text editor to verify.

## What Gets Created

For each contact, the script:
- ✅ Adds them to the `contacts.json` database
- ✅ Creates a unique room (chat session) for them
- ✅ Generates a shareable link they can use to chat with Jean

The links never expire and don't require login — just share them with each family member!
