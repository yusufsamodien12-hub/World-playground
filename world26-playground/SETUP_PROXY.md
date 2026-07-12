# Proxy Setup Instructions

## Problem
You're getting a `401 Unauthorized` error because the application is trying to call the Mistral API directly without valid credentials.

## Solution
The proxy server in `server.js` securely handles API authentication on the backend, keeping your API key safe.

## Steps to Fix

### 1. Add Your Mistral API Key
Edit the `.env` file and replace `your_mistral_api_key_here` with your actual Mistral API key:

```bash
# Edit .env file
MISTRAL_API_KEY=your_actual_mistral_api_key_here
```

To get a Mistral API key:
- Go to https://console.mistral.ai/
- Sign in or create an account
- Navigate to API Keys section
- Create a new API key

### 2. Start the Development Server
Run the following command to start both the proxy server AND Vite:

```bash
npm run dev
```

This will:
- Start the Express proxy server on http://localhost:3001
- Start Vite dev server on http://localhost:5173

### 3. Verify the Setup

Test the proxy server is running:
```bash
curl http://localhost:3001/health
```

Expected response: `{"status":"ok","service":"mistral-proxy"}`

## How It Works

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│   Browser   │─────→│ Proxy Server │─────→│  Mistral API │
│ (aiLogic.ts)│      │ (server.js)  │      │              │
└─────────────┘      └──────────────┘      └──────────────┘
    No API Key         Has API Key          Validates Key
```

- **Browser**: Makes requests to `http://localhost:3001/api/mistral/chat` (no API key exposed)
- **Proxy Server**: Receives request, adds API key from environment variable
- **Mistral API**: Validates key and returns response

## Current Configuration

Your `.env` file is now configured to use the local proxy:

```env
VITE_PROXY_URL=http://localhost:3001/api/mistral/chat
MISTRAL_API_KEY=your_mistral_api_key_here
```

## Troubleshooting

### Error: "API key not configured"
- Make sure you've set `MISTRAL_API_KEY` in `.env`
- Restart the dev server after changing `.env`

### Error: Connection refused
- Check if server.js is running: `ps aux | grep "node server.js"`
- Verify port 3001 is not in use: `lsof -i :3001`

### Error: Still getting 401
- Verify your API key is valid
- Check server logs for detailed error messages
- Test the API key directly: `curl -H "Authorization: Bearer YOUR_KEY" https://api.mistral.ai/v1/models`
