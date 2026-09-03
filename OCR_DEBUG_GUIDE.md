# OCR Debugging Guide

## What Was Wrong

1. **Python script had template string issues** → Fixed
2. **Base64 handling was unreliable** → Now using temp files
3. **No error logging** → Added detailed logging
4. **USE_PADDLE_OCR not set on Render** → Now showing in startup logs

---

## How to Debug

### Step 1: Check Render Logs
1. Go to https://dashboard.render.com
2. Select your service
3. Click **Logs** tab
4. Look for startup message like:
   ```
   [CONFIG] LLM_PROVIDER=groq
   [CONFIG] USE_PADDLE_OCR=1
   [CONFIG] USE_OLLAMA=0
   ```

**If `USE_PADDLE_OCR=0`**, the env variable isn't set!

### Step 2: Fix on Render (if needed)
Go to Settings → Environment and add:
```
USE_PADDLE_OCR = 1
```

Then redeploy.

### Step 3: Test OCR
1. Upload a photo
2. Check Logs tab for messages like:
   ```
   [OCR] Request received, USE_PADDLE_OCR=1, USE_OLLAMA=0
   [OCR] Image received, size: 12345 chars
   [OCR] Success, text length: 523
   ```

### Step 4: If Still Failing
Watch the logs and look for:
- `[OCR] Python spawn error: python3: not found` → Python not installed
- `[OCR] Python error: ModuleNotFoundError: No module named 'paddleocr'` → PaddleOCR not installed
- `[OCR] All methods failed` → Everything failed

---

## Local Testing

### Test on your PC first (easiest way)
```bash
# Install PaddleOCR (one time)
pip install paddleocr pillow

# Run server
export USE_PADDLE_OCR=1
export USE_OLLAMA=0
node server.js
```

Then visit `http://localhost:5173` and test photo upload.

Watch the console output for `[OCR]` debug messages.

---

## Common Issues

| Issue | Fix |
|-------|-----|
| `USE_PADDLE_OCR=0` at startup | Add `USE_PADDLE_OCR=1` to Render env vars |
| `python3: not found` | Alpine Linux issue; update Dockerfile |
| `ModuleNotFoundError: paddleocr` | Dockerfile pip install failed; rebuild |
| `Image received, then timeout` | OCR is running but slow (models downloading) |
| `OCR All methods failed` | Check logs for specific error |

---

## Dockerfile Fixes (if needed)

If Python/PaddleOCR not found on Render, check Dockerfile:

```dockerfile
FROM node:20-alpine
RUN apk add --no-cache python3 py3-pip
RUN pip install --upgrade pip
RUN pip install paddleocr pillow
WORKDIR /app
COPY server.js analyzer.js samples.js ./
COPY public ./public
ENV PORT=8080
ENV USE_OLLAMA=0
ENV USE_PADDLE_OCR=1
EXPOSE 8080
CMD ["node", "server.js"]
```

If issues persist, use non-Alpine image:
```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y python3 python3-pip
RUN pip install paddleocr pillow
# ... rest same as above
```

---

## Next Steps

1. **Push to main** → Render rebuilds
2. **Check startup logs** → Verify `USE_PADDLE_OCR=1`
3. **Test photo upload** → Watch OCR logs
4. **Let me know what you see in the logs!**

The logs will tell us exactly what's failing.
