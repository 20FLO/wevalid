FROM node:20-slim

WORKDIR /app

ENV NEXT_PUBLIC_API_URL=https://wevalid.rmax.synology.me/api

COPY package*.json ./
COPY frontend/ ./frontend/

EXPOSE 3000

CMD ["sh", "-c", "npm install && npm run frontend:dev"]
