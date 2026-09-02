# Déploiement sur Render.com

## Configuration Requise

### 1. **Créer le service**
- Go to https://dashboard.render.com
- Click "New +" → "Web Service"
- Connect GitHub repository: `Gaetan-Galenja/MonCourrierAdmin`
- Branch: `main`

### 2. **Build & Start Commands**

```
Build Command:  echo "No build needed"
Start Command:  node server.js
```

### 3. **Environment Variables** ⚙️

Set these in Render Dashboard → Settings → Environment:

| Key | Value | Required |
|-----|-------|----------|
| `PORT` | `8080` | ✅ Yes |
| `USE_OLLAMA` | `0` | ✅ Yes |
| `LLM_PROVIDER` | `ollama` | ✅ Yes (default, will use heuristic) |
| `OPENAI_API_KEY` | `sk-...` | ❌ No (only if using OpenAI) |
| `OPENAI_MODEL` | `gpt-4o-mini` | ❌ No (only if using OpenAI) |

### 4. **Instance Type**
- Select **Free Plan** (generous for this app)

### 5. **Deploy!**
- Click "Deploy Web Service"
- Render will build from `server.js` and start automatically
- Get your public URL: `https://your-service-name.onrender.com`

## Important Notes

- ⏱️ **First request**: ~30 seconds (free tier spins down after inactivity)
- 🔐 **HTTPS**: Automatic SSL certificate
- 🚀 **Auto-deploy**: Pushes to `main` trigger rebuild
- 📊 **Data**: Historique (history.json) stored in app container (ephemeral — resets on redeploy)

## Optional: Using OpenAI/Groq (Cloud AI)

If you want analysis via API instead of heuristic:

1. Get an API key from:
   - **OpenAI**: https://platform.openai.com/api-keys (free credits)
   - **Groq**: https://console.groq.com (free tier, super fast)

2. Set env vars on Render:
   ```
   LLM_PROVIDER = openai
   OPENAI_API_KEY = sk-...
   OPENAI_MODEL = gpt-4o-mini
   
   # OR for Groq:
   OPENAI_BASE_URL = https://api.groq.com/openai/v1
   OPENAI_MODEL = mixtral-8x7b-32768
   ```

3. Save & redeploy.

## Support

- Render Docs: https://render.com/docs
- Service Logs: Render Dashboard → Logs tab
- GitHub Repo: `Gaetan-Galenja/MonCourrierAdmin`
