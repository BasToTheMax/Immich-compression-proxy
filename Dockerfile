FROM node:20-alpine

# TODO: video compression
# Install ffmpeg + bash + other dependencies
# RUN apk add --no-cache ffmpeg bash

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
