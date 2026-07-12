# 🔧 Troubleshooting Guide

Common issues and their solutions when working with the Cloudflare Worker.

---

## 🚨 Worker Issues

### "Missing API Key" Error

**Symptom:** Worker returns error: `Configuration Error: Missing API Key`

**Solution:**
```bash
cd temp_mistralapicaller
npm run secret:set
# Paste your Mistral API key when prompted
npm run deploy
```

**Verify:**
```bash
npm run secret:list
# Should show MISTRAL_API_KEY
```

---

### CORS Errors in Browser

**Symptom:** Browser console shows CORS error when calling Worker

**Check CORS Headers:**
```bash
curl -I https://YOUR_WORKER.workers.dev/
```

**Should see:**
```
access-control-allow-origin: *
access-control-allow-methods: GET, POST, OPTIONS
```

**If missing:** Worker code has CORS middleware by default. Redeploy:
```bash
cd temp_mistralapicaller
npm run deploy
```

---

### Worker Returns 500 Error

**Symptom:** API calls return HTTP 500

**Check Logs:**
```bash
cd temp_mistralapicaller
npm run logs
# Leave running and make a request
```

**Common causes:**
1. **Missing API key** → Run `npm run secret:set`
2. **Database error** → Run `npm run migrate:remote`
3. **Invalid request format** → Check request body format

---

### Worker Not Updating After Changes

**Symptom:** Code changes don't appear after deployment

**Solutions:**

1. **Clear deployment cache:**
```bash
npx wrangler deploy --compatibility-date=$(date +%Y-%m-%d)
```

2. **Check if deployed:**
```bash
curl https://YOUR_WORKER.workers.dev/
# Check version number in response
```

3. **Hard refresh browser:**
- Chrome/Edge: Ctrl+Shift+R (Cmd+Shift+R on Mac)
- Firefox: Ctrl+F5

---

### Database Errors

**Symptom:** Errors when saving/loading state

**Check database exists:**
```bash
npx wrangler d1 list
# Should show world26-memory
```

**Re-run migrations:**
```bash
cd temp_mistralapicaller
npm run migrate:remote
```

**Query database directly:**
```bash
npx wrangler d1 execute world26-memory --remote \
  --command="SELECT * FROM memory"
```

**Reset database:**
```bash
npx wrangler d1 execute world26-memory --remote \
  --command="DELETE FROM memory"
```

---

## 💻 Frontend Issues

### "Failed to fetch" Error

**Symptom:** Browser shows network error

**Checklist:**
1. ✅ Worker is deployed and running
2. ✅ `.env.local` has correct `VITE_PROXY_URL`
3. ✅ URL ends with `/v1/chat/completions`
4. ✅ No typos in URL

**Test Worker separately:**
```bash
curl https://YOUR_WORKER.workers.dev/
# Should return JSON with status: "online"
```

**Check .env.local:**
```bash
cat .env.local
# Should contain:
# VITE_PROXY_URL=https://...workers.dev/v1/chat/completions
```

**Restart dev server:**
```bash
# Kill current server (Ctrl+C)
npm run dev
```

---

### Environment Variables Not Loading

**Symptom:** App can't find `VITE_PROXY_URL`

**Common causes:**

1. **Wrong file name:**
   - ✅ Correct: `.env.local`
   - ❌ Wrong: `.env`, `env.local`, `.env-local`

2. **Wrong location:**
   - ✅ Correct: Project root (`/workspaces/world26/.env.local`)
   - ❌ Wrong: Worker directory

3. **Missing VITE_ prefix:**
   - ✅ Correct: `VITE_PROXY_URL`
   - ❌ Wrong: `PROXY_URL`

**Fix:**
```bash
# Create/update .env.local in project root
echo "VITE_PROXY_URL=https://YOUR_WORKER.workers.dev/v1/chat/completions" > .env.local

# Restart dev server
npm run dev
```

---

### API Key Exposed in Network Tab

**Symptom:** Mistral API key visible in browser DevTools

**Cause:** Not using Worker proxy, calling API directly

**Solution:**
1. Ensure `.env.local` has `VITE_PROXY_URL`
2. Remove or comment out `VITE_MISTRAL_API_KEY`
3. Restart dev server

**Verify:**
Open DevTools → Network tab → Make request → Check URL
- ✅ Should call: `https://...workers.dev/v1/chat/completions`
- ❌ Should NOT call: `https://api.mistral.ai/...`

---

## 🌐 GitHub Pages Issues

### Site Shows 404

**Symptom:** GitHub Pages URL returns 404

**Solutions:**

1. **Enable GitHub Pages:**
   - Go to repo Settings → Pages
   - Source: Deploy from branch
   - Branch: `gh-pages` (or `main`)
   - Folder: `/` (root)
   - Click Save

2. **Wait for deployment:**
   - Check Actions tab for build status
   - Can take 2-5 minutes

3. **Check base path:**
   Your site is at: `https://USERNAME.github.io/world26/`
   (Note the `/world26/` at the end)

---

### Site Loads But Shows Errors

**Symptom:** Page loads but shows "Missing Credentials" or similar

**Solution:**
Set repository secret for Worker URL:
1. Go to repo Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `VITE_PROXY_URL`
4. Value: `https://YOUR_WORKER.workers.dev/v1/chat/completions`
5. Push a commit to trigger rebuild

---

### Assets Not Loading

**Symptom:** CSS/JS files return 404

**Check base path in `vite.config.ts`:**
```typescript
export default defineConfig({
  base: '/world26/',  // Must match repo name
  // ...
});
```

**Rebuild and redeploy:**
```bash
npm run build
git add dist/
git commit -m "Fix base path"
git push
```

---

## 🔐 Authentication Issues

### Invalid API Key

**Symptom:** Mistral API returns 401 Unauthorized

**Solutions:**

1. **Verify key is correct:**
   - Get fresh key from https://console.mistral.ai/
   - Ensure no extra spaces

2. **Update Worker secret:**
```bash
cd temp_mistralapicaller
npm run secret:set
# Paste correct key
npm run deploy
```

3. **Test directly:**
```bash
curl -X POST https://api.mistral.ai/v1/chat/completions \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"mistral-large-latest","messages":[{"role":"user","content":"test"}]}'
```

---

### Rate Limited

**Symptom:** Error: `429 Too Many Requests`

**Solutions:**

1. **Check Mistral dashboard:**
   - Visit https://console.mistral.ai/
   - Check usage limits

2. **Add rate limiting to Worker** (optional):
```typescript
// In src/index.ts
const RATE_LIMIT = 10; // requests per minute
// Implement rate limiting logic
```

---

## 🧪 Testing Issues

### test.html Not Working

**Symptom:** Test page shows errors

**Solutions:**

1. **Update Worker URL in test.html:**
   - Open in browser
   - Update URL in configuration section
   - Click "Save URL"

2. **Check browser console:**
   - Right-click → Inspect
   - Console tab for detailed errors

3. **Try direct curl:**
```bash
curl https://YOUR_WORKER.workers.dev/
```

---

### Local Development Issues

**Symptom:** `npm run dev` fails in worker directory

**Solutions:**

1. **Install dependencies:**
```bash
cd temp_mistralapicaller
npm install
```

2. **Check Node version:**
```bash
node --version
# Should be 18+ for Cloudflare Workers
```

3. **Clear cache:**
```bash
rm -rf node_modules package-lock.json
npm install
```

---

## 📊 Performance Issues

### Slow Response Times

**Symptom:** API calls take >5 seconds

**Check:**

1. **Worker logs:**
```bash
cd temp_mistralapicaller
npm run logs
# Look for timing information
```

2. **Mistral API status:**
   - Check https://status.mistral.ai/

3. **Network latency:**
```bash
curl -w "@-" -o /dev/null -s https://YOUR_WORKER.workers.dev/ <<'EOF'
    time_namelookup:  %{time_namelookup}\n
       time_connect:  %{time_connect}\n
    time_appconnect:  %{time_appconnect}\n
      time_redirect:  %{time_redirect}\n
   time_starttransfer:  %{time_starttransfer}\n
                     ----------\n
         time_total:  %{time_total}\n
EOF
```

---

## 🗄️ Database Issues

### State Not Persisting

**Symptom:** State resets after page reload

**Check:**

1. **Database exists:**
```bash
npx wrangler d1 list
```

2. **Migrations applied:**
```bash
cd temp_mistralapicaller
npm run migrate:remote
```

3. **Test save/load:**
```bash
# Save
curl -X POST https://YOUR_WORKER.workers.dev/state \
  -H "Content-Type: application/json" \
  -d '{"state":{"test":true}}'

# Load
curl https://YOUR_WORKER.workers.dev/state
```

---

## 🛠️ Build Issues

### `npm run build` Fails

**Symptom:** Build errors in frontend

**Solutions:**

1. **Clear cache:**
```bash
rm -rf node_modules dist .vite
npm install
npm run build
```

2. **Check TypeScript errors:**
```bash
npx tsc --noEmit
```

3. **Update dependencies:**
```bash
npm update
```

---

## 📞 Still Having Issues?

### Diagnostic Checklist

Run these commands and check output:

```bash
# 1. Worker health
curl https://YOUR_WORKER.workers.dev/

# 2. Worker logs
cd temp_mistralapicaller && npm run logs

# 3. Worker secrets
cd temp_mistralapicaller && npm run secret:list

# 4. Database status
npx wrangler d1 list

# 5. Frontend env
cat .env.local

# 6. Node version
node --version

# 7. Git status
git status
```

### Collect Information

Before seeking help, gather:
- ✅ Error messages (exact text)
- ✅ Worker logs output
- ✅ Browser console errors
- ✅ Steps to reproduce
- ✅ What you've already tried

### Resources

- 📚 [Cloudflare Docs](https://developers.cloudflare.com/workers/)
- 📚 [Wrangler Docs](https://developers.cloudflare.com/workers/wrangler/)
- 📚 [Mistral Docs](https://docs.mistral.ai/)
- 💬 [Cloudflare Discord](https://discord.gg/cloudflaredev)

---

## 💡 Prevention Tips

### Best Practices

1. **Always test Worker separately** before testing frontend
2. **Use `npm run logs`** while developing
3. **Keep Worker URL in `.env.local`** for easy switching
4. **Test with `curl`** before testing in browser
5. **Check Cloudflare dashboard** for usage stats
6. **Version control** `.env.example` but NOT `.env.local`

### Monitoring

Set up alerts in Cloudflare dashboard:
- Error rate > 10%
- Response time > 2s
- Request volume spikes

---

**Most issues are solved by:**
1. Checking Worker is deployed: `curl https://YOUR_WORKER.workers.dev/`
2. Verifying API key is set: `npm run secret:list`
3. Checking `.env.local` has correct URL
4. Restarting dev server after changes

---

*Happy debugging! 🐛*
