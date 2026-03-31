# Jean's Messenger — Google Cloud VPS Deployment Guide

Step-by-step instructions written for beginners. Take it one step at a time!

---

## What We're Building

A private real-time chat app with three pages:
- **`/`** — Jean's page (her big-button chat interface, PIN protected)
- **`/chat/[unique-id]`** — Each family member's private chat page
- **`/admin`** — Your control panel to add contacts and get their links

---

## Step 1 — SSH Into Your Google Cloud Server

On your computer, open a terminal and connect to your VPS:

```bash
ssh your-username@YOUR_SERVER_IP
```

Replace `YOUR_SERVER_IP` with your Google Cloud instance's external IP address.
(Find this in Google Cloud Console → Compute Engine → VM Instances)

---

## Step 2 — Install Node.js (if not already installed)

Run these commands on your server one at a time:

```bash
# Download and run the Node.js installer
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js
sudo apt-get install -y nodejs

# Verify it worked — should show v20.x.x
node --version
npm --version
```

---

## Step 3 — Upload Your Project Files

**Option A: Using SCP (copy from your computer)**

On your LOCAL computer (not the server), open a terminal and run:

```bash
scp -r "In House Messenger App" your-username@YOUR_SERVER_IP:~/jeans-messenger
```

**Option B: Using GitHub (recommended for updates)**

1. Create a free GitHub account at github.com
2. Create a new repository named `jeans-messenger`
3. Upload your project files to GitHub
4. On your server, run:
   ```bash
   git clone https://github.com/YOUR_USERNAME/jeans-messenger.git ~/jeans-messenger
   ```

---

## Step 4 — Set Up the Project on the Server

```bash
# Go into the project folder
cd ~/jeans-messenger

# Install the required packages
npm install

# Create your .env file from the template
cp .env.example .env

# Open the .env file to fill in your settings
nano .env
```

Inside nano, fill in your values:

```
JEAN_PIN=1234           ← Pick any 4-digit number Jean will remember
ADMIN_PASSWORD=         ← Make up a strong password for yourself
PORT=3000
```

To save in nano: press `Ctrl+X`, then `Y`, then `Enter`.

---

## Step 5 — Open the Firewall Port

Google Cloud blocks ports by default. You need to open port 3000 (or 80 for standard web).

1. Go to **Google Cloud Console** → **VPC Network** → **Firewall**
2. Click **"Create Firewall Rule"**
3. Fill in:
   - **Name:** `allow-messenger`
   - **Targets:** All instances in the network
   - **Source IPv4 ranges:** `0.0.0.0/0`
   - **Protocols and ports:** TCP → `3000`
4. Click **Save**

---

## Step 6 — Install PM2 (Keeps the App Running 24/7)

PM2 is a free tool that keeps your app running even if the server restarts.

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start your app with PM2
pm2 start server.js --name "jeans-messenger"

# Make it auto-start when the server reboots
pm2 startup
# (PM2 will show you a command to run — copy and run it)

pm2 save

# Check it's running
pm2 status
```

---

## Step 7 — Test It!

Open a browser and go to:

```
http://YOUR_SERVER_IP:3000
```

You should see Jean's PIN login screen! 🎉

**Test checklist:**
- [ ] Jean's page loads at `http://YOUR_SERVER_IP:3000`
- [ ] Admin panel loads at `http://YOUR_SERVER_IP:3000/admin`
- [ ] Log into admin and add a test contact
- [ ] Copy their link and open it in another browser tab
- [ ] Send a message from Jean's side — does it appear on the family side?

---

## Step 8 — Add a Domain Name (Optional, When Ready)

When you have a domain name (like `jeansporch.com`), here's how to connect it:

### 8a. Point Your Domain to Your Server
1. Log into your domain registrar (Namecheap, Google Domains, etc.)
2. Find **DNS Settings** for your domain
3. Add an **A Record**:
   - **Host:** `@` (or `chat` for a subdomain like `chat.yourdomain.com`)
   - **Value:** Your server's IP address
   - **TTL:** Auto or 3600
4. Save. DNS changes take 5–30 minutes to spread worldwide.

### 8b. Set Up Nginx as a Reverse Proxy (Serves on Port 80)
This lets visitors use `http://jeansporch.com` instead of `:3000`.

```bash
# Install nginx
sudo apt-get install -y nginx

# Create a config file for your site
sudo nano /etc/nginx/sites-available/jeans-messenger
```

Paste this in (replace `jeansporch.com` with your domain):

```nginx
server {
    listen 80;
    server_name jeansporch.com www.jeansporch.com;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Save with Ctrl+X → Y → Enter, then:

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/jeans-messenger /etc/nginx/sites-enabled/

# Test the config (should say "syntax is ok")
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx

# Allow port 80 through the firewall (repeat Step 5 but for port 80)
```

Now visit `http://jeansporch.com` — it should work without `:3000`!

### 8c. Add HTTPS (Free SSL with Let's Encrypt)
This makes your site secure (`https://`):

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d jeansporch.com -d www.jeansporch.com
```

Follow the prompts. Certbot will auto-configure HTTPS and renew the certificate automatically.

---

## Useful Commands After Deployment

```bash
# View live server logs (useful for debugging)
pm2 logs jeans-messenger

# Restart the app (after making changes)
pm2 restart jeans-messenger

# Stop the app
pm2 stop jeans-messenger

# Update the app after changing files
cd ~/jeans-messenger
git pull          # (if using GitHub)
npm install       # (if package.json changed)
pm2 restart jeans-messenger
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Can't reach the site | Check Google Cloud firewall has port 3000 open |
| "Cannot connect to server" in admin | Make sure the server is running (`pm2 status`) |
| PIN not working | Check JEAN_PIN in your `.env` file |
| App crashes on start | Run `pm2 logs` to see the error message |
| Domain not working | DNS may still be spreading — wait 30 min and retry |

---

## How the Family Links Work

After deploying, log into the admin panel and add contacts. Each contact gets a unique link like:

```
https://jeansporch.com/chat/a3f8b2c1d4e5f6a7b8c9
```

Text or email that link to the family member once. They bookmark it and use it forever.
Each link is private — only that person has access to their conversation with Jean.

---

## Adding SMS (Twilio) Later

When you're ready to add SMS so Jean can text people who aren't on the web app,
we can add Twilio to the existing server. The code is already designed to support it.
Just let Claude know and we'll add it together!
