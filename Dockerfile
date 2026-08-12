FROM node:20-alpine
WORKDIR /app
COPY . .
ENV PORT=17826
EXPOSE 17826
CMD ["node", "server.js"]
