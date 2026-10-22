FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY openapi.yaml ./openapi.yaml
RUN mkdir -p /app/data
ENV NODE_ENV=production PORT=5050
EXPOSE 5050
CMD ["npm", "start"]
