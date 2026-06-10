FROM docker.m.daocloud.io/library/node:22-bookworm-slim

WORKDIR /workspace

RUN echo 'Acquire::Retries "10";' > /etc/apt/apt.conf.d/80-retries && \
    echo 'Acquire::http::Timeout "60";' >> /etc/apt/apt.conf.d/80-retries && \
    echo 'Acquire::https::Timeout "60";' >> /etc/apt/apt.conf.d/80-retries && \
    apt-get update -o Acquire::Retries=10 || apt-get update || apt-get update
RUN sed -i 's|http://deb.debian.org/debian|http://mirrors.aliyun.com/debian|g' /etc/apt/sources.list.d/debian.sources && \
    sed -i 's|http://security.debian.org/debian-security|http://mirrors.aliyun.com/debian-security|g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update
RUN apt-get install -y --no-install-recommends --fix-missing -o Acquire::Retries=10 openssl ffmpeg || \
    apt-get install -y --no-install-recommends --fix-missing -o Acquire::Retries=10 openssl ffmpeg || \
    apt-get install -y --no-install-recommends --fix-missing -o Acquire::Retries=10 openssl ffmpeg
RUN rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@9.15.9

COPY package.json pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY prisma ./prisma
COPY shared ./shared
COPY packages ./packages
COPY apps/server-gateway ./apps/server-gateway
COPY assets/demo ./assets/demo

RUN pnpm install
RUN pnpm prisma:generate
RUN pnpm --filter @nestjs/prisma build
RUN pnpm --filter @tikstream/shared-types build
RUN pnpm --filter @tikstream/server-gateway build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["pnpm", "--filter", "@tikstream/server-gateway", "start"]