# Frontend Angular servi par nginx. Construire depuis la RACINE du dépôt.
#   docker build -f frontend/Dockerfile -t visiocheck-frontend .
FROM node:22-slim AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/visiocheck/browser /usr/share/nginx/html
EXPOSE 80
