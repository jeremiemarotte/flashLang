FROM python:3.12-slim

WORKDIR /app

COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api/app ./app
COPY api/alembic ./alembic
COPY api/alembic.ini .
COPY api/entrypoint.sh .
COPY hermes-skill/SKILL.md ./hermes-skill/SKILL.md
RUN chmod +x entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
