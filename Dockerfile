# Mon Courrier Admin — image de deploiement (zero dependance npm)
FROM node:20-alpine
WORKDIR /app
COPY server.js analyzer.js samples.js ./
COPY public ./public
ENV PORT=8080
# En ligne, l'app tourne sans Ollama local :
#  - soit IA cloud : LLM_PROVIDER=openai + OPENAI_API_KEY (+ OPENAI_BASE_URL/OPENAI_MODEL)
#  - soit moteur heuristique seul : USE_OLLAMA=0 (defaut ci-dessous)
ENV USE_OLLAMA=0
EXPOSE 8080
CMD ["node", "server.js"]
