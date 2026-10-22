FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# API_KEY, nginx başlarken default.conf.template üzerinden envsubst ile işlenir
# (sadece API_KEY'i filtreliyoruz; aksi halde nginx'in $host gibi kendi değişkenleri de değişebilir).
ENV NGINX_ENVSUBST_FILTER=API_KEY
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
