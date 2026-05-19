FROM node:20-alpine

WORKDIR /app

# Copy server files
COPY server/package.json ./
RUN npm install --production

COPY server/server.js ./
COPY server/poller.js ./

COPY dist/ ./dist/

# Data volume for config + fleet persistence
VOLUME ["/app/data"]

EXPOSE 4001

ENV NODE_ENV=production

CMD ["node", "server.js"]
