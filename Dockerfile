# Mon Courrier Admin — image de deploiement (PaddleOCR support)
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
