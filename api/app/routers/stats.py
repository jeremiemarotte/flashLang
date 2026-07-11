from datetime import datetime, time, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import require_any_client
from app.database import get_db
from app.models import Card, Review
from app.schemas import DailyStats

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/daily", response_model=DailyStats, dependencies=[Depends(require_any_client)])
def daily_stats(db: Session = Depends(get_db)) -> DailyStats:
    now = datetime.now(timezone.utc)
    start_of_day = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)

    due_now = db.scalar(select(func.count()).select_from(Card).where(Card.due <= now)) or 0

    todays_reviews = list(db.scalars(select(Review).where(Review.reviewed_at >= start_of_day)))
    reviewed_today = len(todays_reviews)
    retention_today = (
        sum(1 for r in todays_reviews if r.rating in (3, 4)) / reviewed_today if reviewed_today else None
    )

    return DailyStats(due_now=due_now, reviewed_today=reviewed_today, retention_today=retention_today)
