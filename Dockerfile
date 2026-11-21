# Drawlytics – production image (API + built web client on one origin)
FROM node:20-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client ./
RUN npm run build

FROM node:20-alpine AS server
RUN apk add --no-cache openssl
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server ./
RUN npx prisma generate && npm run build

FROM node:20-alpine
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app/server
COPY --from=server /app/server ./
COPY --from=client /app/client/dist /app/client/dist
RUN npm prune --omit=dev && npx prisma generate
USER node
EXPOSE 4000
# Apply migrations, then start the API (which also serves the web client).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/index.js"]
