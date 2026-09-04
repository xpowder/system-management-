FROM node:22-alpine AS build

WORKDIR /app

# Build context is the Git repo root (not /frontend).
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ .
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine

ENV PORT=80 \
    BACKEND_URL=http://backend:8000 \
    NGINX_LOCAL_RESOLVERS=8.8.8.8 \
    NGINX_ENVSUBST_FILTER=PORT|BACKEND_URL|NGINX_LOCAL_RESOLVERS

COPY frontend/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
