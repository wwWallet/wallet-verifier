FROM node:24-bullseye-slim AS builder

WORKDIR /app

COPY package.json yarn.lock ./

RUN apt-get update && apt-get install -y \
	build-essential \
	git \
	ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

COPY . .
RUN yarn install --frozen-lockfile && yarn build && rm -rf node_modules/ && yarn install --frozen-lockfile --production


FROM gcr.io/distroless/nodejs24-debian12 AS production
WORKDIR /home/node/app
USER nonroot

COPY --from=builder /app/package.json .
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/views ./views
COPY --from=builder /app/partials ./partials

ENV NODE_ENV=production

EXPOSE 8005

CMD ["./dist/src/app.js"]
