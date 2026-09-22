FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
COPY e2e/package.json e2e/
RUN npm ci --workspace server --workspace shared --include-workspace-root
COPY shared shared
COPY server server
RUN npm run build -w server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/server/dist ./server/dist
EXPOSE 4000
CMD ["node", "server/dist/index.js"]
