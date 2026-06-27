FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY src/ ./src/
EXPOSE 8005
CMD ["node", "src/main.js"]
