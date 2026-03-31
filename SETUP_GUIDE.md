# In-House Messenger API — Setup & Deployment Guide

A step-by-step guide written for beginners. Take it one step at a time!

---

## What You'll Need

- A free [Twilio account](https://www.twilio.com/try-twilio)
- A free [Railway account](https://railway.app) (for hosting)
- A free [GitHub account](https://github.com) (Railway deploys from GitHub)
- [Node.js](https://nodejs.org) installed on your computer (download the LTS version)

---

## Step 1 — Set Up Twilio (Your SMS Sender)

1. Go to [twilio.com/try-twilio](https://www.twilio.com/try-twilio) and create a free account.
2. After signing in, go to your **Console Dashboard**.
3. You'll see your **Account SID** and **Auth Token** — copy these somewhere safe.
4. Click **"Get a Twilio phone number"** — this is the number texts will be sent FROM.
   - Copy that number too (it looks like +15551234567).

> 💡 **Free trial note:** With a free Twilio account, you can only send texts to phone numbers you've verified. To send to any number, you'll need to upgrade (it's pay-as-you-go, around $0.0075/text).

---

## Step 2 — Set Up the Project on Your Computer

Open a terminal (Mac: search "Terminal", Windows: search "Command Prompt").

```bash
# 1. Go into the project folder
cd "In House Messenger App"

# 2. Install the required packages
npm install

# 3. Create your .env file from the template
cp .env.example .env
```

Now open the `.env` file in a text editor and fill in your values:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  ← from Twilio console
TWILIO_AUTH_TOKEN=your_actual_token                   ← from Twilio console
TWILIO_PHONE_NUMBER=+15551234567                      ← your Twilio phone number
API_KEY=make_up_anything_long_and_random_here         ← you choose this!
PORT=3000
```

---

## Step 3 — Test It Locally

```bash
# Start the server
npm start
```

You should see:
```
🚀 In-House Messenger API is running!
   Local address: http://localhost:3000
```

### Test the health check
Open your browser and go to: `http://localhost:3000/health`

You should see: `{"success":true,"status":"online",...}`

### Send a test SMS
Use a tool like [Postman](https://www.postman.com) (free) or this terminal command:

```bash
curl -X POST http://localhost:3000/send-sms \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY_HERE" \
  -d '{"to": "+1YOUR_PHONE_NUMBER", "message": "Hello from my app!"}'
```

You should receive a text message! 🎉

---

## Step 4 — Deploy to Railway (Go Live on the Internet)

### 4a. Put Your Code on GitHub
1. Go to [github.com](https://github.com) → click **"New"** to create a repository.
2. Name it `in-house-messenger` → click **"Create repository"**.
3. Follow the instructions GitHub shows to push your code.

> ⚠️ **Important:** Make sure your `.env` file is NOT uploaded. The `.gitignore` file we included will prevent this automatically.

### 4b. Connect to Railway
1. Go to [railway.app](https://railway.app) and sign in with GitHub.
2. Click **"New Project"** → **"Deploy from GitHub repo"**.
3. Select your `in-house-messenger` repository.
4. Railway will automatically detect it's a Node.js app and deploy it.

### 4c. Add Your Environment Variables
1. In your Railway project, click on your service.
2. Go to the **"Variables"** tab.
3. Add each variable from your `.env` file:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PHONE_NUMBER`
   - `API_KEY`
4. Railway will restart your app automatically.

### 4d. Get Your Public URL
1. Go to the **"Settings"** tab in Railway.
2. Click **"Generate Domain"** — you'll get a URL like `https://your-app.railway.app`.
3. Test it: visit `https://your-app.railway.app/health` in your browser.

---

## Step 5 — Call the API from Your Other Apps

Replace `https://your-app.railway.app` with your actual Railway URL.

### Send a Single SMS

**Request:**
```
POST https://your-app.railway.app/send-sms
Header: x-api-key: your_api_key
Body (JSON):
{
  "to": "+15558675309",
  "message": "Your appointment is tomorrow at 3pm."
}
```

**Response:**
```json
{
  "success": true,
  "messageSid": "SMxxxxxxxxxxxxxxxxx",
  "to": "+15558675309",
  "status": "queued"
}
```

### Send to Multiple Numbers at Once

```
POST https://your-app.railway.app/send-bulk
Header: x-api-key: your_api_key
Body (JSON):
{
  "numbers": ["+15558675309", "+15551234567"],
  "message": "Reminder: store closes early today at 5pm."
}
```

### Example: Calling from JavaScript (in another app)
```javascript
async function sendText(phoneNumber, message) {
  const response = await fetch('https://your-app.railway.app/send-sms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'your_api_key_here'
    },
    body: JSON.stringify({ to: phoneNumber, message: message })
  });
  return await response.json();
}

// Usage:
sendText('+15558675309', 'Your order has shipped!');
```

### Example: Calling from Python (in another app)
```python
import requests

def send_text(phone_number, message):
    response = requests.post(
        'https://your-app.railway.app/send-sms',
        headers={
            'Content-Type': 'application/json',
            'x-api-key': 'your_api_key_here'
        },
        json={'to': phone_number, 'message': message}
    )
    return response.json()

# Usage:
send_text('+15558675309', 'Your order has shipped!')
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `401 Unauthorized` | Check that you're sending the correct `x-api-key` header |
| `Twilio error 21608` | Your Twilio trial account can only text verified numbers — verify the number in Twilio console |
| `Twilio error 21211` | Phone number format is wrong — use +1XXXXXXXXXX format |
| Server won't start | Check that your `.env` file exists and has all values filled in |
| Railway deploy fails | Check the Logs tab in Railway for the error message |

---

## What's Next (Future Improvements)

The API is designed to be extended. Here are ideas for future communication types:

- **Email** — Add a `/send-email` endpoint using [SendGrid](https://sendgrid.com) or [Nodemailer](https://nodemailer.com)
- **WhatsApp** — Twilio supports WhatsApp too! Add a `/send-whatsapp` endpoint
- **Push Notifications** — Use [Firebase FCM](https://firebase.google.com/docs/cloud-messaging) for mobile app notifications
- **Message History** — Add a database (like [PostgreSQL on Railway](https://railway.app)) to log all sent messages
- **Delivery Receipts** — Use Twilio webhooks to track if messages were delivered
