from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.routers import cards, reviews, stats

app = FastAPI(title="flashLang API")

app.include_router(cards.router)
app.include_router(reviews.router)
app.include_router(stats.router)

# PWA is not a separate service — it's served as static files from this same container.
app.mount("/", StaticFiles(directory="app/static", html=True), name="pwa")
