FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

COPY requirements-m1.lock .
RUN python -m pip install --upgrade pip \
    && python -m pip install -r requirements-m1.lock

COPY . .

EXPOSE 8000

CMD ["python", "main.py"]
