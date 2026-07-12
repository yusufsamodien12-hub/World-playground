# 🌍 World26 Playground

> **This project was split.** The AI decision-making logic (prompting,
> Mistral calls, response parsing) now lives in a separate project:
> **`world26-ai-agent`**. This repo is just the 3D world/playground — it
> renders the simulation and exposes a generic `/api/decide` endpoint that
> forwards to whatever AI agent you point it at via `AGENT_URL`. It contains
> no AI-provider code or API keys.
>
> Run the agent separately (`cd world26-ai-agent && npm run dev`), set
> `AGENT_URL` in this project's `.env` to point at it (default
> `http://localhost:4000`), then run this playground as usual. See
> `services/agentClient.ts` and `server.js`'s `/api/decide` route for the
> contract. Swap agents freely — different model, different provider, a
> rules bot — without touching this project.

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 🌍 World26 - AI-Powered 3D Simulation

An intelligent world-building simulation, rendered in 3D with Three.js. Driven by a separate, swappable AI agent project (see banner above).

**View in AI Studio:** https://ai.studio/apps/drive/1_EaOtIuOLUaXP2xbDTVMLnFIQ3aBOmEv

---

## 📚 Documentation

| Guide | Description |
|-------|-------------|
| **[🚀 Quick Start](QUICKSTART.md)** | Fast command reference for common tasks |
| **[🏗️ Architecture](ARCHITECTURE.md)** | System design and data flow |
| **[📊 Workflow](DEPLOYMENT_WORKFLOW.md)** | Visual deployment steps |
| **[🔧 Troubleshooting](TROUBLESHOOTING.md)** | Common issues and solutions |
| **[✅ Setup Complete](SETUP_COMPLETE.md)** | Summary of what was created |

---

## 🏃 Run Locally

**Prerequisites:** Node.js 18+

```bash
# 1. Install dependencies
npm install

# 2. Configure (choose one):
# Option A: Use Worker proxy (recommended)
echo "VITE_PROXY_URL=https://your-worker.workers.dev/v1/chat/completions" > .env.local

# Option B: Direct API key (development only)
echo "VITE_MISTRAL_API_KEY=your_key_here" > .env.local

# 3. Start development server
npm run dev
```

Open http://localhost:5173 🎉

## Deploy to GitHub Pages

### 🔒 Option 1: Secure Cloudflare Worker Proxy (Recommended)

**Benefits:** API key stays hidden, no CORS issues, edge network performance

1. **Deploy the Worker:**
   ```bash
   cd temp_mistralapicaller
   npm install
   npm run setup  # Automated setup script
   # OR manually:
   npm run secret:set  # Set your Mistral API key
   npm run migrate:remote  # Set up database
   npm run deploy  # Deploy to Cloudflare
   ```

2. **Copy your Worker URL** (e.g., `https://mistralapicaller.yourusername.workers.dev`)

3. **Configure Frontend:**
   Update `.env.local`:
   ```bash
   VITE_PROXY_URL=https://YOUR_WORKER.workers.dev/v1/chat/completions
   ```

4. **Deploy to GitHub:**
   ```bash
   git add .
   git commit -m "Add Cloudflare Worker proxy"
   git push origin main
   ```

📚 **Full Worker Documentation:**
- [Deployment Guide](temp_mistralapicaller/DEPLOYMENT.md)
- [Integration Guide](temp_mistralapicaller/INTEGRATION.md)
- [Interactive Test](temp_mistralapicaller/test.html)

---

### Option 2: Direct Key (Not Recommended for Public Repos)
- Add a repository secret named `VITE_MISTRAL_API_KEY` with your Mistral key.
- ⚠️ **Warning:** API key will be exposed in browser network requests

---

**After Setup:**
- Push to `main` to trigger [.github/workflows/deploy.yml](.github/workflows/deploy.yml); it builds and publishes to GitHub Pages.
- Pages base is `/world26/`, so the site will be served from `https://<your-user>.github.io/world26/` once Pages is enabled for the repo.
