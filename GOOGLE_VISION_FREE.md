# Free OCR Solution: Google Cloud Vision (100 req/month FREE)

## Why This Works
- ✅ **100 requests/month completely FREE** (no credit card needed for free tier)
- ✅ **Works on Render** (cloud-to-cloud, instant)
- ✅ **Better than Ollama** (faster, more accurate)
- ✅ **No setup on your PC**

## Setup (5 minutes)

### 1. **Create Free Google Cloud Account**
- Go to: https://cloud.google.com/vision/docs/quickstart
- Click "Try the API"
- Sign in with Google account

### 2. **Enable Vision API**
- Console → APIs → "Vision API"
- Click "Enable"

### 3. **Create Service Account & Get JSON Key**
```
1. Console → Credentials
2. Create Credential → Service Account
3. Name: "mon-courrier-ocr"
4. Create & Continue
5. Go to Keys tab → Add Key → JSON
6. Download JSON file (save somewhere safe)
```

### 4. **Convert JSON to Base64**
On Windows PowerShell:
```powershell
$key = Get-Content "path-to-your-key.json" -Raw
[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($key)) | Set-Clipboard
```

### 5. **Add to Render Environment**
Render Dashboard → Settings → Environment:
```
GOOGLE_VISION_ENABLED = 1
GOOGLE_VISION_KEY = (paste your base64 key here)
```

### 6. **Redeploy**
- Render auto-redeploys
- OCR now works on your live site!

---

## Cost Breakdown
- **Free Tier**: 100 requests/month = 0 €
- **If you exceed**: $1.50 per 1,000 requests (very cheap)
- For a small app, free tier is plenty

---

## Alternative: Microsoft Azure Vision
- Also has free tier (20 requests/month)
- Similar setup process

---

## Why NOT free TesseractOCR?
- Tesseract is free but ~40-60s per image (too slow)
- Google Cloud = instant

**TL;DR**: Free Google Cloud Vision is your best bet for OCR on Render! ✅
