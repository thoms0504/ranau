FROM python:3.12-slim
WORKDIR /app/apps/api
COPY apps/api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/api /app/apps/api
COPY data/processed /app/data/processed
ENV RANAU_DB=/app/data/ranau.db
CMD ["sh", "-c", "[ -f $RANAU_DB ] || (python -m ml.generate_dummy && python -m ml.train); uvicorn app.main:app --host 0.0.0.0 --port 8000"]
