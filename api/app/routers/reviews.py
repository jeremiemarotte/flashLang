from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import require_any_client
from app.database import get_db
from app.fsrs_engine import apply_review
from app.models import Card, Review
from app.schemas import ReviewCreate, ReviewOut

router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.post("", response_model=ReviewOut, dependencies=[Depends(require_any_client)])
def submit_review(review_in: ReviewCreate, db: Session = Depends(get_db)) -> ReviewOut:
    card = db.get(Card, review_in.card_id)
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "card not found")

    interval_days = apply_review(card, review_in.rating)

    db.add(Review(card_id=card.id, rating=review_in.rating, interval_days=interval_days))
    db.commit()
    db.refresh(card)

    return ReviewOut(card=card, interval_days=interval_days)
