import logging
import os
from functools import lru_cache

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer

logger = logging.getLogger('text_embed_server')

MODEL_NAME = os.getenv(
    'TEXT_EMBED_MODEL',
    'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
)
LOCAL_MODEL_PATH = os.getenv('LOCAL_MODEL_PATH', '')
EMBEDDING_DIM = int(os.getenv('EMBEDDING_DIM', '384'))

_model_ready = False
_model_error: str | None = None

app = FastAPI(title='TikStream Text Embed Server', version='1.0.0')


class EmbedRequest(BaseModel):
    text: str = Field(min_length=1)


class EmbedResponse(BaseModel):
    embedding: list[float]
    dim: int


DEFAULT_BAKED_MODEL_PATH = '/app/model-cache/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'


def resolve_model_path() -> str:
    path_file = os.getenv('MODEL_PATH_FILE', '/app/model-path.txt')
    if os.path.isfile(path_file):
        with open(path_file, encoding='utf-8') as file:
            baked_path = file.read().strip()
            if baked_path and os.path.isdir(baked_path):
                return baked_path

    if LOCAL_MODEL_PATH and os.path.isdir(LOCAL_MODEL_PATH):
        return LOCAL_MODEL_PATH

    if os.path.isdir(DEFAULT_BAKED_MODEL_PATH):
        return DEFAULT_BAKED_MODEL_PATH

    return MODEL_NAME


@lru_cache(maxsize=1)
def get_model() -> SentenceTransformer:
    model_path = resolve_model_path()
    logger.info('Loading SentenceTransformer from %s', model_path)
    return SentenceTransformer(model_path)


@app.on_event('startup')
def warm_model() -> None:
    global _model_ready, _model_error
    try:
        get_model()
        _model_ready = True
        logger.info('Model loaded successfully from %s', resolve_model_path())
    except Exception as error:
        _model_error = str(error)
        logger.error('Model warm-up failed (non-fatal): %s', _model_error)


@app.get('/health')
def health() -> dict[str, str | int | bool]:
    return {
        'status': 'ok',
        'model': MODEL_NAME,
        'dim': EMBEDDING_DIM,
        'ready': _model_ready,
    }


@app.get('/ready')
def ready() -> dict[str, bool | str | None]:
    if not _model_ready:
        raise HTTPException(status_code=503, detail=_model_error or 'model not loaded')
    return {'ready': True, 'model': resolve_model_path()}


@app.post('/embed', response_model=EmbedResponse)
def embed(request: EmbedRequest) -> EmbedResponse:
    if not _model_ready:
        raise HTTPException(
            status_code=503,
            detail=_model_error or 'embedding model is not ready',
        )

    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail='text must not be empty')

    model = get_model()
    vector = model.encode(text, normalize_embeddings=True)
    embedding = vector.tolist()

    if len(embedding) != EMBEDDING_DIM:
        raise HTTPException(
            status_code=500,
            detail=f'Unexpected embedding dim {len(embedding)}, expected {EMBEDDING_DIM}',
        )

    return EmbedResponse(embedding=embedding, dim=EMBEDDING_DIM)
