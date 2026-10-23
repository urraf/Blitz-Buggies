# Blitz Buggies - production image (game server + built web client on one port)
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/package.json ./
COPY --from=build /app/server/package.json server/
COPY --from=build /app/node_modules/ws node_modules/ws
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- "http://localhost:${PORT}/health" || exit 1
CMD ["node", "server/dist/index.js"]
