FROM docker.m.daocloud.io/library/python:3.11-slim

WORKDIR /app

RUN sed -i 's|http://deb.debian.org/debian|https://mirrors.tuna.tsinghua.edu.cn/debian|g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends curl git && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt

ENV TEXT_EMBED_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
ENV EMBEDDING_DIM=384
ENV HF_ENDPOINT=https://hf-mirror.com
ENV HF_HUB_DISABLE_XET=1
ENV HF_HOME=/app/model-cache
ENV SENTENCE_TRANSFORMERS_HOME=/app/model-cache

COPY download_model.py .
RUN python download_model.py \
    && test -f /app/model-path.txt \
    && test -d "$(cat /app/model-path.txt)"

ENV LOCAL_MODEL_PATH=/app/model-cache/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
ENV HF_HUB_OFFLINE=1
ENV TRANSFORMERS_OFFLINE=1

COPY app.py .

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -sf http://localhost:8080/ready || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]