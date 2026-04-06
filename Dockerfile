FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY services/task-service/package*.json ./services/task-service/
RUN cd services/task-service && npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]