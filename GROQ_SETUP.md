# Setup Groq API (FREE) for Better Spam Detection

## Quick Setup

1. **Create free account**
   - Go to: https://console.groq.com
   - Sign up (takes 1 minute)
   
2. **Get your API key**
   - Dashboard → API Keys
   - Copy: `gsk_...` (your free key)
   
3. **Add to Render**
   - Go to: https://dashboard.render.com/web/srv-dac4iinqj5pc739ue04g/settings
   - Click "Environment"
   - Add these variables:
   
   ```
   LLM_PROVIDER = groq
   OPENAI_API_KEY = gsk_YOUR_KEY_HERE
   OPENAI_BASE_URL = https://api.groq.com/openai/v1
   OPENAI_MODEL = mixtral-8x7b-32768
   ```

4. **Save & Redeploy**
   - Render auto-redeploys on env change
   - Test at your live URL

## Why Groq?

✅ **Free tier is generous** (~10,000 requests/month, plenty for testing)
✅ **Fast** (1-3 seconds per analysis)
✅ **No credit card required**
✅ **Great for spam detection** (Mixtral is excellent at pattern recognition)

## Cost

- **Free tier**: Up to 10,000 requests/month
- **Paid** (if you exceed): $0.000625 per 1M input tokens (very cheap)

## Support

- Groq Docs: https://console.groq.com/docs
- Status: https://status.groq.com
