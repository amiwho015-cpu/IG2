
# File Name: Dockerfile
# ICA: igbot-api
# Author: Tanvir Ahmed (Tanvir143)
# GitHub: www.github.com/143tanvir
# Instagram: @ig.tanvir_ahmed

FROM node:20-alpine

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

COPY package.json ./

RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY --chown=node:node . .

RUN mkdir -p /app/data \
    && chown node:node /app/data

USER node

EXPOSE 8080

CMD ["node", "index.js"]
