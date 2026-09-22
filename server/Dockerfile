# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
COPY e2e/package.json e2e/
RUN npm ci --workspace server --workspace shared --include-workspace-root
COPY scripts scripts
COPY shared shared
COPY server server
RUN npm run build -w server

# ---- runtime: production dependencies only, non-root ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
COPY e2e/package.json e2e/
RUN npm ci --omit=dev --workspace server --workspace shared --include-workspace-root && npm cache clean --force
COPY --from=build /app/server/dist ./server/dist
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- http://localhost:4000/api/ready || exit 1
CMD ["node", "server/dist/index.js"]
