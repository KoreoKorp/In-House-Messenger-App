# Jean's Messenger App

A private, secure, real-time chat and video calling web application designed specifically for a senior user to easily communicate with their family without the complexity of public social media.

## Features

*   **Jean's Dashboard (`/`):** A simplified, large-button, PIN-protected interface where Jean can see online contacts, read/reply to messages, send broadcast messages, and receive video calls.
*   **Family Chat Links (`/chat/:id`):** Each family member gets a unique, private URL slug (e.g., `/chat/corey`) to chat or initiate WebRTC video calls.
*   **Admin Control Panel (`/admin`):** Protected by an admin password, allowing caregivers to manage contacts, update PINs, configure unique chat links, and view security alerts.
*   **Security & IP Tracking:** Logs the IP address of family members upon their first visit. Access from new IPs triggers an alert and sends a Discord Webhook notification to the administrator to prevent link abuse.

## Tech Stack

*   **Backend:** Node.js with Express.js
*   **Real-time Engine:** Socket.io (messaging, online status, WebRTC signaling)
*   **Frontend:** Vanilla HTML, CSS, and JavaScript (Lightweight, no heavy frameworks)
*   **Database:** Local JSON-based file system (highly portable, no external DB required)
*   **Hosting:** PM2 & Nginx

## Integration

This application serves as the backend and signaling server for the **Grandma's Launcher** application, providing seamless real-time video calls and messaging directly to the launcher's kiosk interface.

## Documentation
For more detailed guides on how to set up, deploy, and manage the system, see the following files:
*   [SETUP_GUIDE.md](./SETUP_GUIDE.md)
*   [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md)
*   [LAUNCHER_INTEGRATION_GUIDE.md](./LAUNCHER_INTEGRATION_GUIDE.md)
*   [BULK_IMPORT_README.md](./BULK_IMPORT_README.md)
## Quick Start

### Prerequisites
* **Node.js** (v18 or higher recommended)
* **npm**

### Installation & Setup

1. **Install dependencies:**
   ```bash
   cd in-house-messenger-app
   npm install
   ```

2. **Configure Environment:**
   Copy the example environment file and adjust the settings if necessary.
   ```bash
   cp .env.example .env
   ```

3. **Start the Development Server:**
   ```bash
   npm run dev
   ```
   *The server will start (default port 3000). You can access Jean's interface at `http://localhost:3000` and the Admin panel at `http://localhost:3000/admin`.*

4. **Production Deployment:**
   To run in production, it is recommended to use PM2:
   ```bash
   npm install -g pm2
   pm2 start server.js --name "jeans-messenger"
   pm2 save
   ```
