FROM docker.m.daocloud.io/library/node:22-bookworm-slim

WORKDIR /workspace

ENV CHROMIUM_BINARY=chromium

RUN echo 'Acquire::Retries "10";' > /etc/apt/apt.conf.d/80-retries && \
    echo 'Acquire::http::Timeout "60";' >> /etc/apt/apt.conf.d/80-retries && \
    sed -i 's|http://deb.debian.org/debian|http://mirrors.ustc.edu.cn/debian|g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update || apt-get update || apt-get update
RUN apt-get install -y --no-install-recommends --fix-missing ffmpeg ca-certificates fonts-noto-cjk || \
    apt-get install -y --no-install-recommends --fix-missing ffmpeg ca-certificates fonts-noto-cjk || \
    apt-get install -y --no-install-recommends --fix-missing ffmpeg ca-certificates fonts-noto-cjk
RUN apt-get install -y --no-install-recommends --fix-missing -o Acquire::Retries=20 chromium || \
    apt-get install -y --no-install-recommends --fix-missing -o Acquire::Retries=20 chromium || \
    apt-get install -y --no-install-recommends --fix-missing -o Acquire::Retries=30 chromium
RUN rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@9.15.9 nodemon

COPY package.json pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY workers/remotion-render-worker ./workers/remotion-render-worker
COPY assets/bgm ./assets/bgm

# Root workspace lists prisma; this worker does not use it. Skip postinstall scripts
# to avoid @prisma/engines download failures (ECONNRESET) during Docker build.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --ignore-scripts
RUN pnpm --filter @tikstream/remotion-render-worker build

ENV NODE_ENV=production

EXPOSE 3102

CMD ["pnpm", "--filter", "@tikstream/remotion-render-worker", "start"]