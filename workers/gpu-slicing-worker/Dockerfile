FROM docker.m.daocloud.io/library/node:22-bookworm-slim AS node

# 使用镜像源拉取 PyTorch 镜像
FROM docker.m.daocloud.io/pytorch/pytorch:2.3.1-cuda12.1-cudnn8-runtime

WORKDIR /workspace

COPY --from=node /usr/local /usr/local

RUN sed -i 's|http://archive.ubuntu.com/ubuntu|https://mirrors.tuna.tsinghua.edu.cn/ubuntu|g' /etc/apt/sources.list.d/ubuntu.sources 2>/dev/null; \
    sed -i 's|http://security.ubuntu.com/ubuntu|https://mirrors.tuna.tsinghua.edu.cn/ubuntu|g' /etc/apt/sources.list.d/ubuntu.sources 2>/dev/null; \
    sed -i 's|http://archive.ubuntu.com/ubuntu|https://mirrors.tuna.tsinghua.edu.cn/ubuntu|g' /etc/apt/sources.list 2>/dev/null; \
    sed -i 's|http://security.ubuntu.com/ubuntu|https://mirrors.tuna.tsinghua.edu.cn/ubuntu|g' /etc/apt/sources.list 2>/dev/null; \
    apt-get update || apt-get update || apt-get update
RUN apt-get install -y --no-install-recommends ffmpeg || \
    (sleep 5 && apt-get update && apt-get install -y --no-install-recommends ffmpeg) || \
    (sleep 10 && apt-get update && apt-get install -y --no-install-recommends ffmpeg)
RUN rm -rf /var/lib/apt/lists/*

ENV PATH="/usr/bin:${PATH}"

RUN command -v ffmpeg && command -v ffprobe

# =============================================================================
# 安装 Python 依赖 (yt-dlp, demucs, faster-whisper, ultralytics, cv2)
# =============================================================================
RUN pip install --no-cache-dir \
    yt-dlp \
    demucs \
    faster-whisper \
    transformers \
    accelerate \
    ultralytics \
    opencv-python-headless \
    2>/dev/null || pip3 install --no-cache-dir \
    yt-dlp \
    demucs \
    faster-whisper \
    transformers \
    accelerate \
    ultralytics \
    opencv-python-headless \
    2>/dev/null; true

RUN npm install -g pnpm@9.15.9 nodemon

COPY package.json pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY workers/gpu-slicing-worker ./workers/gpu-slicing-worker

RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --ignore-scripts
RUN pnpm --filter @tikstream/gpu-slicing-worker build

ENV NODE_ENV=production

EXPOSE 3101

CMD ["pnpm", "--filter", "@tikstream/gpu-slicing-worker", "start"]