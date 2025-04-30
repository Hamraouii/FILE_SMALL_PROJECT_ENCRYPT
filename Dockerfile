# Dockerfile
FROM node:16-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the application
COPY . .

# Create uploads directory
RUN mkdir -p uploads && chown -R node:node /app

# Switch to non-root user
USER node

EXPOSE 3000

CMD ["node", "app.js"]