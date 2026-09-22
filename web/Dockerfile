FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
COPY e2e/package.json e2e/
RUN npm ci --workspace web --workspace shared --include-workspace-root
COPY shared shared
COPY web web
RUN npm run build -w web

FROM nginx:1.27-alpine
COPY web/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
