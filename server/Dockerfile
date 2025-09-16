FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY server/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY server /app/server

ENV FLASK_APP=server.app:app \
    FLASK_RUN_HOST=0.0.0.0 \
    FLASK_RUN_PORT=8000

EXPOSE 8000

CMD ["python", "-m", "server.app"]

