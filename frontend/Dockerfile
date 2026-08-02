# syntax=docker/dockerfile:1

# ---- Build stage: compile the Vite/React app ----
FROM node:20-alpine AS build
WORKDIR /app

# VITE_API_BASE is baked in at build time. Default keeps the app same-origin so
# Nginx can reverse-proxy /api to the backend (no CORS needed).
ARG VITE_API_BASE=/api
ENV VITE_API_BASE=$VITE_API_BASE

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime stage: serve static files with Nginx ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
