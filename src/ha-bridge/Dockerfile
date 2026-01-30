# Home Mind API - HA Bridge
FROM node:20-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm install typescript && npm run build && rm -rf node_modules/.cache

# Clean up dev dependencies and source
RUN npm prune --production && rm -rf src/ tsconfig.json

# Expose port
EXPOSE 3100

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3100/api/health || exit 1

# Start server
CMD ["node", "dist/index.js"]
