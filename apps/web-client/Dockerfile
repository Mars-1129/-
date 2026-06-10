FROM docker.m.daocloud.io/library/node:22-bookworm-slim

WORKDIR /workspace

RUN npm install -g pnpm@9.15.9

COPY package.json pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY shared ./shared
COPY apps/web-client ./apps/web-client

ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN pnpm install
RUN pnpm --filter @tikstream/shared-types build
RUN pnpm --filter @tikstream/web-client build

ENV NODE_ENV=production

EXPOSE 5173

CMD ["pnpm", "--filter", "@tikstream/web-client", "preview"]
