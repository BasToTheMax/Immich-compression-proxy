FROM node:20-alpine
# FROM oven/bun:alpine

# TODO: video compression
# Install ffmpeg + bash + other dependencies
# RUN apk add --no-cache ffmpeg bash

WORKDIR /app

COPY package*.json ./
RUN npm install -g bun 

# RUN bun install

RUN npm install

COPY . .

EXPOSE 3000
#CMD ["bun", "run", "index.js"]
CMD ["node", "index.js"]
