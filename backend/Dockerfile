FROM node:18-slim
WORKDIR /app
# Копируем package.json из папки backend
COPY backend/package*.json ./
RUN npm install --production
# Копируем ВООБЩЕ ВСЁ из проекта
COPY . .
EXPOSE 4000
# Запускаем сервер, указывая путь к нему
CMD ["node", "backend/server.js"]
