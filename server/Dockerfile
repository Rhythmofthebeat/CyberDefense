FROM node:20-alpine

WORKDIR /app

# Copy server files
COPY package.json ./
RUN npm install --production

COPY server.js ./

# Copy built dashboard if present
COPY dist/ ./dist/ 2>/dev/null || true

# Data volume for config + fleet persistence
VOLUME ["/app/data"]

EXPOSE 4001

ENV NODE_ENV=production

CMD ["node", "server.js"]
