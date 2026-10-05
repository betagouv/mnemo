FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN apt-get update && apt-get install --yes --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
COPY . .
RUN pnpm install --frozen-lockfile --filter '@mnemo/database...'

CMD ["pnpm", "--filter", "@mnemo/database", "db:migrate"]
