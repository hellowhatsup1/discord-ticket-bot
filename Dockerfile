FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

# Debug: list files inside /app so we can confirm index.js is there
RUN ls -al /app

CMD ["node", "index.js"]
