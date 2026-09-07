FROM python:3.10-slim

ARG FUNASR_VERSION=1.4.1

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    FUNASR_DEVICE=cpu \
    FUNASR_MODEL=sensevoice \
    FUNASR_HUB=ms

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg git libsndfile1 \
    && rm -rf /var/lib/apt/lists/* \
    && python -m pip install --upgrade pip \
    && python -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu \
    && python -m pip install \
        "funasr==${FUNASR_VERSION}" \
        fastapi \
        "uvicorn[standard]" \
        python-multipart

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=600s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3).read()" || exit 1

CMD ["sh", "-c", "funasr-server --host 0.0.0.0 --port 8000 --device \"${FUNASR_DEVICE}\" --model \"${FUNASR_MODEL}\" --hub \"${FUNASR_HUB}\""]
