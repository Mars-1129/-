import os
import sys
import time
import shutil

os.environ.setdefault('HF_ENDPOINT', 'https://hf-mirror.com')
os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
os.environ.setdefault('HF_HOME', '/app/model-cache')

MODEL_ID = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'
CACHE_DIR = os.environ.get('HF_HOME', '/app/model-cache')
PATH_FILE = '/app/model-path.txt'
MAX_RETRIES = 5


def download_via_modelscope() -> str:
    from modelscope import snapshot_download

    return snapshot_download(MODEL_ID, cache_dir=CACHE_DIR)


def download_via_hf_mirror() -> str:
    from huggingface_hub import snapshot_download

    return snapshot_download(
        MODEL_ID,
        cache_dir=CACHE_DIR,
        endpoint=os.environ['HF_ENDPOINT'],
        resume_download=True,
    )


def download_via_hf_direct() -> str:
    from huggingface_hub import snapshot_download

    return snapshot_download(
        MODEL_ID,
        cache_dir=CACHE_DIR,
        resume_download=True,
    )


def try_download(name: str, fn, max_retries: int = MAX_RETRIES) -> str:
    for attempt in range(1, max_retries + 1):
        try:
            print(f'Trying {name} (attempt {attempt}/{max_retries})...', flush=True)
            path = fn()
            print(f'{name} OK: {path}', flush=True)
            return path
        except Exception as error:
            print(f'{name} attempt {attempt} failed: {error}', flush=True)
            if attempt < max_retries:
                delay = min(2 ** attempt, 30)
                print(f'Retrying {name} in {delay}s...', flush=True)
                time.sleep(delay)
                _clean_partial()
    raise RuntimeError(f'{name}: all {max_retries} attempts failed')


def _clean_partial() -> None:
    for root, dirs, files in os.walk(CACHE_DIR):
        for name in files:
            if name.endswith('.incomplete'):
                path = os.path.join(root, name)
                try:
                    os.remove(path)
                except OSError:
                    pass


def verify_load(model_path: str) -> None:
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(model_path)
    vector = model.encode('test', normalize_embeddings=True)
    if len(vector) != 384:
        raise RuntimeError(f'unexpected dim {len(vector)}, expected 384')


def main() -> None:
    os.makedirs(CACHE_DIR, exist_ok=True)
    errors: list[str] = []

    for name, fn in [
        ('modelscope', download_via_modelscope),
        ('hf-mirror', download_via_hf_mirror),
        ('hf-direct', download_via_hf_direct),
    ]:
        try:
            model_path = try_download(name, fn)
            verify_load(model_path)
            with open(PATH_FILE, 'w', encoding='utf-8') as file:
                file.write(model_path)
            print(f'Model ready at {model_path}', flush=True)
            return
        except Exception as error:
            errors.append(f'{name}: {error}')
            print(f'{name}: exhausted after {MAX_RETRIES} retries: {error}', flush=True)

    raise RuntimeError('all download methods failed: ' + '; '.join(errors))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'FATAL: {error}', flush=True)
        sys.exit(1)
