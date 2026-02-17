Accord
Accord is a serverless, open-source real-time chat application inspired by Discord. It is built to run entirely on the Cloudflare ecosystem, offering a scalable, low-cost, and privacy-focused alternative to traditional chat platforms.

🚀 Overview
Accord provides a full-featured chat experience including text, voice, and video, all without a dedicated server. It leverages Cloudflare's edge network to manage real-time connections and storage.

Key Features
Real-Time Messaging: Instant text chat with typing indicators, read receipts, and markdown support.

Voice & Video: Peer-to-peer voice and video calls using WebRTC, with support for muting, camera toggling, and screen sharing.

Text-to-Speech (TTS): Listen to incoming messages automatically with customizable voice settings.

Rich Media: Upload files, images, and custom emojis (stored in R2).

Modern UI: A responsive, Discord-like interface built with React and Tailwind CSS.

PWA Support: Installable as a desktop or mobile app with offline capabilities.

Secure Auth: User registration, login, and password recovery via unique recovery keys.

🛠️ Technology Stack
Accord uses a modern, serverless architecture:

Frontend: React, Vite, Zustand (State), Tailwind CSS.

Backend / API: Cloudflare Workers (Serverless functions).

Real-Time Engine: Cloudflare Durable Objects (WebSockets & State).

Database: Cloudflare D1 (SQLite) for user data and chat history.

Storage: Cloudflare R2 for file uploads and media.

🏗️ Architecture
The application connects users directly to a global edge network:

Static Assets: The React frontend is served via Cloudflare Workers Assets.

API Requests: Handled by Workers for authentication and data fetching.

Live Connections: Durable Objects manage unique chat rooms, handling WebSocket connections for thousands of concurrent users.

Data Persistence: Chat history is saved to D1, while larger files go to R2.

⚡ Quick Start
Prerequisites
Node.js (v16+): Download

Cloudflare Account: Sign up

Wrangler CLI: Install globally:

Bash
npm install -g wrangler
💻 Local Development
The project is split into two parts: the frontend (React/Vite) and the worker (Backend API/WebSockets). You will need two terminal windows to run the development environment effectively.

1. Setup Backend (Worker)
Navigate to the worker directory:

Bash
cd chat-app/worker
Install Dependencies:

Bash
npm install
Configure Environment Variables:
Copy the example environment file and fill in your Firebase credentials (required for Push Notifications).

Bash
cp .dev.vars.example .dev.vars
Edit .dev.vars with your actual Firebase project details.

Setup Local Database:
Initialize the local D1 database by applying the schema migrations.

Bash
npx wrangler d1 execute chat-history --local --file=../database/migrations/9999_migrate_all.sql
(Note: If the migration fails, try applying files 0001 through 0006 individually from the ../database/migrations folder).

Start the Backend Server:

Bash
npx wrangler dev
The backend will start at http://localhost:8787.

2. Setup Frontend (React)
Open a NEW terminal window and navigate to the frontend directory:

Bash
cd chat-app/frontend
Install Dependencies:

Bash
npm install
Start the Frontend Server:

Bash
npm run dev
The frontend will start (usually at http://localhost:5173). It is configured to proxy API requests to your local worker.

🚀 Deployment
Deploying to the Cloudflare global network requires setting up the persistent storage resources (D1 & R2) and configuring the secrets.

1. Authenticate
Log in to your Cloudflare account via the CLI:

Bash
npx wrangler login
2. Create Cloudflare Resources
Run these commands to create your production database and file bucket:

Bash
# Create the Database
npx wrangler d1 create chat-history

# Create the File Storage Bucket
npx wrangler r2 bucket create chat-files
⚠️ IMPORTANT: The first command will output a database_id (looks like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx). Copy this ID!

3. Configure Worker
Navigate to chat-app/worker.

Copy the configuration template:

Bash
cp wrangler.toml.example wrangler.toml
Open wrangler.toml and replace <DATABASE_ID> with the ID you copied in the previous step.

4. Apply Database Schema (Production)
Apply the database structure to your live Cloudflare D1 database:

Bash
npx wrangler d1 execute chat-history --remote --file=../database/migrations/9999_migrate_all.sql
5. Upload Secrets
Securely upload your Firebase credentials to Cloudflare (do not commit these to Git):

Bash
npx wrangler secret put FIREBASE_PROJECT_ID
npx wrangler secret put FIREBASE_CLIENT_EMAIL
npx wrangler secret put FIREBASE_PRIVATE_KEY
# Repeat for other FIREBASE_* keys found in .dev.vars
6. Build and Deploy
Finally, build the frontend assets and deploy the worker.

Build Frontend:

Bash
cd ../frontend
npm run build
This compiles the React app. Ensure your worker configuration is set to serve static assets from the frontend build output (e.g., dist or public).

Deploy Worker:

Bash
cd ../worker
npx wrangler deploy
Your app is now live! Wrangler will output your production URL (e.g., https://accord.your-subdomain.workers.dev).

📄 License
AGPL-3.0-only