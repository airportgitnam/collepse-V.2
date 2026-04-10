FROM node:18-slim
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --production
COPY . .
EXPOSE 4000
CMD ["node", "backend/server.js"]
