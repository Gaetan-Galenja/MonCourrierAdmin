# PaddleOCR Setup (Free, Fast, No Credit Card)

## Why PaddleOCR?
✅ **Free** (open source, no API key needed)
✅ **Fast** (2-5s per image vs 40s+ Ollama)
✅ **Accurate** (especially for French text)
✅ **Works on Render** (Python in container)
✅ **No credit card required**

## Setup

### Option 1: Local (Your PC)
```bash
pip install paddleocr pillow
```

Then run:
```bash
node server.js
```

The app will auto-detect and use PaddleOCR if installed.

### Option 2: Render Cloud

Update `Dockerfile`:
```dockerfile
FROM node:20-alpine
RUN apk add --no-cache python3 py3-pip
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

Push to GitHub → Render auto-builds with PaddleOCR included.

### Option 3: Hybrid (Recommended)
- Local: PaddleOCR (Python on your PC)
- Render: Disable OCR (text-only for now)
- Later: Add PaddleOCR to Dockerfile if you want cloud OCR

---

## Implementation in Node.js

The app needs a Python OCR subprocess. Here's the integration:

```javascript
const { spawn } = require('child_process');

async function ocrWithPaddle(b64) {
  return new Promise((resolve) => {
    const python = spawn('python3', ['-c', `
import sys
import base64
import json
from paddleocr import PaddleOCR
ocr = PaddleOCR(use_angle_cls=True, lang='ch')
img_data = base64.b64decode(sys.argv[1])
import io
from PIL import Image
img = Image.open(io.BytesIO(img_data))
result = ocr.ocr(img, cls=True)
text = '\\n'.join([line[0][1] for line in result if line])
print(text)
`, b64], { timeout: 120000 });
    
    let output = '';
    python.stdout.on('data', (data) => { output += data; });
    python.on('close', () => { resolve(output.trim()); });
  });
}
```

---

## Cost Comparison

| Solution | Cost | Speed | Setup |
|----------|------|-------|-------|
| Google Vision | $1.50/1000 | Instant | Need credit card |
| PaddleOCR | FREE | 2-5s | Python pip install |
| Ollama Local | FREE | 35-70s | GPU recommended |
| Tesseract | FREE | 10-15s | apt install |

**PaddleOCR wins for free + fast!** ✅

---

## Next Steps

1. **For local testing**: 
   ```bash
   pip install paddleocr pillow
   node server.js
   ```

2. **For Render cloud** (optional):
   - Update `Dockerfile` with PaddleOCR
   - Push to GitHub
   - Render rebuilds automatically

3. **Test**:
   - Upload a photo
   - Should extract text in 2-5s

---

Need help implementing? Let me know!
