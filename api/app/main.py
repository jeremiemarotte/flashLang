from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles

from app.routers import cards, reviews, stats

app = FastAPI(title="flashLang API")

app.include_router(cards.router)
app.include_router(reviews.router)
app.include_router(stats.router)

SKILL_MD_PATH = Path("hermes-skill/SKILL.md")


@app.get("/skill.md", response_class=PlainTextResponse)
def get_skill_md() -> str:
    """Serves the Hermes skill instructions baked into this image, so the Claude Code deployment
    (a separate Dockge stack) can fetch the version that actually matches what's running here
    instead of keeping its own copy manually in sync."""
    return SKILL_MD_PATH.read_text()


# PWA is not a separate service — it's served as static files from this same container.
app.mount("/", StaticFiles(directory="app/static", html=True), name="pwa")
