# Backend NestJS. Construire depuis la RACINE du dépôt (le contexte inclut proto/).
#   docker build -f backend/Dockerfile -t visiocheck-backend .
FROM node:22-slim AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm install
COPY backend/ ./
COPY proto/ /proto/
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY backend/package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
# Contrat proto attendu à /proto par le résolveur.
COPY proto/ /proto/
EXPOSE 3000
CMD ["node", "dist/main.js"]
