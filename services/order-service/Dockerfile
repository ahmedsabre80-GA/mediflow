FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --legacy-peer-deps
COPY . .
EXPOSE 8010
CMD ["node", "src/main.js"]
