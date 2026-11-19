# Workbench dev server image. Serves the Vite harness on PORT (default 5217).
# Built/run from the activity-root docker-compose.yml.
FROM node:20-alpine

WORKDIR /app

# Install deps first for layer caching.
COPY package.json ./
RUN npm install

# Copy the rest of the package.
COPY . .

EXPOSE 5217

# vite.config.ts sets server.host=true so the dev server is reachable from the
# container host. strictPort keeps the published port stable.
CMD ["npm", "run", "dev"]
