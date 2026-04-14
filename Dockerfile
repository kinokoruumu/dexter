FROM oven/bun:1-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json bun.lock ./
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 bun install --frozen-lockfile --production

COPY . .

EXPOSE 8080
CMD ["bun", "run", "src/api/server.ts"]
