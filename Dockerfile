FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache tzdata

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY server.js store.js accounts.js ./
COPY public/index.html ./public/index.html
COPY public/css/style.css ./public/css/style.css
COPY public/js/date.js public/js/api.js public/js/calendar.js public/js/app.js public/js/accounts.js ./public/js/
RUN mkdir -p /app/data && chown node:node /app/data

ENV PORT=3000
ENV DATA_DIR=/app/data
ENV TZ=America/Santiago
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
