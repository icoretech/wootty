FROM node:24-bookworm-slim AS web-builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @icoretech/wootty-web build

FROM golang:1.26-bookworm AS server-builder

WORKDIR /src

COPY apps/server/go.mod apps/server/go.sum ./apps/server/
RUN cd apps/server && go mod download

COPY apps/server ./apps/server
COPY --from=web-builder /app/apps/web/dist ./apps/server/internal/webassets/dist

RUN cd apps/server && CGO_ENABLED=0 go build -o /out/woottyd ./cmd/woottyd

FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/apps/server

COPY --from=server-builder /out/woottyd /usr/local/bin/wootty
RUN ln -s /usr/local/bin/wootty /usr/local/bin/woottyd \
  && ln -s /usr/local/bin/wootty /app/apps/server/woottyd

EXPOSE 8080

CMD ["wootty", "run"]
