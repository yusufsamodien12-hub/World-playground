# ⚡ Quick Command Reference

## 🚀 Deploy Worker (First Time)

```bash
cd temp_mistralapicaller
npm install
npm run secret:set        # Paste your Mistral API key when prompted
npm run migrate:remote    # Set up D1 database
npm run deploy           # Deploy to Cloudflare
```

**Copy your Worker URL from the output!**

---

## 🔄 Update Worker (After Changes)

```bash
cd temp_mistralapicaller
npm run deploy
```

---

## 🧪 Test Worker

### Health Check
```bash
curl https://YOUR_WORKER.workers.dev/
```

### Test AI Endpoint
```bash
curl -X POST https://YOUR_WORKER.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mistral-large-latest",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Test State Save
```bash
curl -X POST https://YOUR_WORKER.workers.dev/state \
  -H "Content-Type: application/json" \
  -d '{"state": {"test": true}}'
```

### Test State Load
```bash
curl https://YOUR_WORKER.workers.dev/state
```

---

## 🔍 Debug Worker

### View Real-Time Logs
```bash
cd temp_mistralapicaller
npm run logs
```

### Run Worker Locally
```bash
cd temp_mistralapicaller
npm run dev
# Access at http://localhost:8787
```

---

## 🔐 Manage Secrets

### Set API Key
```bash
cd temp_mistralapicaller
npm run secret:set
```

### List All Secrets
```bash
cd temp_mistralapicaller
npm run secret:list
```

---

## 🗄️ Database Commands

### Run Migrations (Remote)
```bash
cd temp_mistralapicaller
npm run migrate:remote
```

### Run Migrations (Local)
```bash
cd temp_mistralapicaller
npm run migrate:local
```

### Query Database
```bash
cd temp_mistralapicaller
npx wrangler d1 execute world26-memory --remote --command="SELECT * FROM memory"
```

### Clear All State
```bash
cd temp_mistralapicaller
npx wrangler d1 execute world26-memory --remote --command="DELETE FROM memory"
```

---

## 🌐 Frontend Setup

### Configure Worker URL
```bash
# Create/edit .env.local in project root
echo "VITE_PROXY_URL=https://YOUR_WORKER.workers.dev/v1/chat/completions" > .env.local
```

### Run Frontend Locally
```bash
npm run dev
# Open http://localhost:5173
```

### Build for Production
```bash
npm run build
```

### Deploy to GitHub Pages
```bash
git add .
git commit -m "Add Cloudflare Worker proxy"
git push origin main
```

---

## 📊 Monitoring

### View Worker Analytics
```bash
# Open in browser:
https://dash.cloudflare.com → Workers & Pages → mistralapicaller → Metrics
```

### Check Worker Status
```bash
curl -I https://YOUR_WORKER.workers.dev/
```

### Monitor Database Usage
```bash
cd temp_mistralapicaller
npx wrangler d1 info world26-memory
```

---

## 🛠️ Troubleshooting

### Worker Returns "Missing API Key"
```bash
cd temp_mistralapicaller
npm run secret:set
# Paste your Mistral API key
npm run deploy
```

### CORS Errors in Browser
```bash
# Check CORS headers
curl -I https://YOUR_WORKER.workers.dev/

# Should see:
# access-control-allow-origin: *
```

### Database Errors
```bash
cd temp_mistralapicaller
npm run migrate:remote
npm run deploy
```

### Worker Not Updating
```bash
cd temp_mistralapicaller
npx wrangler deploy --compatibility-date=$(date +%Y-%m-%d)
```

### Frontend Not Using Proxy
```bash
# Check .env.local exists
cat .env.local

# Should contain:
# VITE_PROXY_URL=https://...

# Restart dev server
npm run dev
```

---

## 📦 Package.json Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run worker locally |
| `npm run deploy` | Deploy to Cloudflare |
| `npm run logs` | View real-time logs |
| `npm run secret:set` | Set MISTRAL_API_KEY |
| `npm run secret:list` | List all secrets |
| `npm run migrate:local` | Run DB migrations locally |
| `npm run migrate:remote` | Run DB migrations on production |
| `npm run setup` | Automated first-time setup |

---

## 🔗 Useful Links

| Resource | URL |
|----------|-----|
| **Worker Dashboard** | https://dash.cloudflare.com/workers |
| **D1 Dashboard** | https://dash.cloudflare.com/d1 |
| **Wrangler Docs** | https://developers.cloudflare.com/workers/wrangler/ |
| **Mistral AI Docs** | https://docs.mistral.ai/ |
| **GitHub Pages** | https://username.github.io/world26/ |

---

## 📝 Environment Variables

### Frontend (.env.local)
```bash
# Required for production
VITE_PROXY_URL=https://YOUR_WORKER.workers.dev/v1/chat/completions

# Optional for local dev
VITE_MISTRAL_API_KEY=your_key_here
```

### Worker (Cloudflare Secrets)
```bash
# Set via: npm run secret:set
MISTRAL_API_KEY=your_mistral_api_key
```

---

## ✅ Deployment Checklist

- [ ] Worker deployed to Cloudflare
- [ ] `MISTRAL_API_KEY` secret configured
- [ ] D1 database migrations applied
- [ ] Worker URL copied
- [ ] `.env.local` updated with `VITE_PROXY_URL`
- [ ] Frontend tested locally (`npm run dev`)
- [ ] Changes committed to Git
- [ ] Pushed to GitHub (`git push origin main`)
- [ ] GitHub Pages enabled in repo settings
- [ ] Production site tested

---

## 🎯 Common Tasks

### Update API Key
```bash
cd temp_mistralapicaller
npm run secret:set
npm run deploy
```

### Check If Worker Is Live
```bash
curl https://YOUR_WORKER.workers.dev/
# Should return JSON with status: "online"
```

### View Last 100 Logs
```bash
cd temp_mistralapicaller
npx wrangler tail --format=pretty
```

### Backup Database State
```bash
cd temp_mistralapicaller
npx wrangler d1 execute world26-memory --remote \
  --command="SELECT * FROM memory" > backup.json
```

### Restore Database State
```bash
cd temp_mistralapicaller
npx wrangler d1 execute world26-memory --remote \
  --file=restore.sql
```

---

## 🚨 Emergency Commands

### Rollback Worker Deployment
```bash
cd temp_mistralapicaller
npx wrangler rollback
```

### Delete All Worker Secrets
```bash
cd temp_mistralapicaller
npx wrangler secret delete MISTRAL_API_KEY
```

### Delete Worker Completely
```bash
cd temp_mistralapicaller
npx wrangler delete mistralapicaller
```

---

## 💡 Pro Tips

1. **Use `npx wrangler tail` while testing** to see real-time logs
2. **Test locally with `npm run dev`** before deploying
3. **Keep Worker URL in `.env.local`** for easy environment switching
4. **Monitor Cloudflare dashboard** for usage and errors
5. **Set up alerts** in Cloudflare for high error rates

---

## 📞 Need Help?

- 📚 [Full Deployment Guide](temp_mistralapicaller/DEPLOYMENT.md)
- 🔗 [Integration Guide](temp_mistralapicaller/INTEGRATION.md)
- 🏗️ [Architecture Overview](ARCHITECTURE.md)
- 🧪 [Interactive Test Page](temp_mistralapicaller/test.html)

---

**Happy deploying! 🚀**
