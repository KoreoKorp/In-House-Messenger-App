# Messenger + Launcher Integration Setup

You now have:
1. ✅ **VCF Bulk Import Script** — imports all contacts from vcf file
2. ✅ **MessengerView Component** — embeds messenger directly in the launcher
3. ✅ **Launcher Integration** — added 'messenger' tile support

## Step 1: Bulk Import Jean's Contacts

Copy your VCF file to the messenger app folder, then run the import script on your VPS:

```bash
# SSH into your server
ssh root@34.132.145.35

# Navigate to messenger app
cd ~/in-house-messenger-app

# Copy the VCF file here (from your local machine, or upload it)
# If on your local machine:
scp "C:\Users\Coreh\Downloads\Grammie Contacts.vcf" root@34.132.145.35:~/in-house-messenger-app/

# Run the import
node import-vcf-contacts.js "Grammie Contacts.vcf"
```

**Example output:**
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
```

Save those links — you can give them to each family member so they can chat with Jean!

---

## Step 2: Rebuild the Launcher with Messenger Integration

The launcher source code has been updated with the new `MessengerView` component. Now rebuild it:

```bash
# On your local machine, in the launcher folder
cd "C:\Users\Coreh\Desktop\grandmas-launcher"

# Install dependencies (first time only)
npm install

# Rebuild the launcher
npm run build

# Create a new installer
npm run package
```

This will create a new installer at:
```
C:\Users\Coreh\Desktop\grandmas-launcher\dist\Grandma's Launcher Setup 1.0.X.exe
```

Install it over the existing launcher.

---

## Step 3: Add Messenger Tile in Admin Panel

Once the launcher is rebuilt, open the **Admin Panel** (password protected):

1. **Start the launcher** on Jean's computer
2. **Open Admin Panel** on the laptop screen
3. Go to **Tile Manager** tab
4. Click **Add New Tile**
5. Fill in:
   - **Title:** "Messages" or "Chat" or "Family"
   - **Type:** "Built-in"
   - **Target:** "messenger"
   - **Icon:** 💬 or 📱 or 💌

6. Click **Save**
7. The tile will appear on the main launcher screen

---

## Step 4: How It Works

When Jean taps the **Messages** tile:

1. ✅ The messenger interface loads **inside the launcher** (no external windows)
2. ✅ She sees a clean chat interface with all family members
3. ✅ The back button returns her to the home screen
4. ✅ Everything stays contained in the launcher window

The messenger runs on your VPS at `http://34.132.145.35:3000` and is embedded as an iframe, so:
- No external windows pop up
- Everything is contained within the launcher
- Family members use their unique links to chat with Jean
- Jean sees all family members in one interface

---

## Step 5: Troubleshooting

**"Messenger Not Available" error in launcher?**
- Check that your VPS messenger service is running: `pm2 status`
- Make sure the URL in the tile is correct (default: `http://34.132.145.35:3000`)
- Verify firewall: `sudo ufw status`

**Contacts didn't import?**
- Check the script output for error messages
- Verify the VCF file format
- Try importing just one contact to test

**Need to change the messenger URL?**
- In the admin panel, you can add a config setting:
  ```json
  "messenger": {
    "url": "http://your-vps-ip:3000"
  }
  ```

---

## Files Modified/Created

**Messenger App:**
- ✅ `import-vcf-contacts.js` — VCF parser & bulk import script
- ✅ `BULK_IMPORT_README.md` — Import script documentation

**Launcher:**
- ✅ `src/renderer/launcher/src/views/MessengerView.jsx` — New messenger interface component
- ✅ `src/renderer/launcher/src/App.jsx` — Updated to support 'messenger' view type

---

## Next Steps

1. ✅ Run the VCF import script to load all contacts
2. ✅ Rebuild the launcher (`npm run build && npm run package`)
3. ✅ Install the new launcher on Jean's computer
4. ✅ Add a "Messages" tile in the admin panel with type "Built-in" and target "messenger"
5. ✅ Test by tapping the tile — the messenger should load inside the launcher!

Good luck! 🚀
