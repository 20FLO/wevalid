FROM node:20-alpine

WORKDIR /app

# Installer les dépendances système pour Sharp et PDF
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    ghostscript \
    imagemagick \
    poppler-utils \
    qpdf

# Copier package files
COPY package*.json ./

# Installer les dépendances Node
RUN npm ci --omit=dev

# Copier le code source
COPY . .

# Créer les dossiers nécessaires
RUN mkdir -p /app/storage/uploads \
    /app/storage/thumbnails \
    /app/storage/temp \
    /app/logs

# Exposer le port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Démarrer l'application
CMD ["node", "src/server.js"]