import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import require_any_client, require_hermes
from app.database import get_db
from app.fsrs_engine import new_card_fsrs_state, normalize_front
from app.models import Card
from app.schemas import CardBatchCreate, CardCreate, CardOut

router = APIRouter(prefix="/cards", tags=["cards"])


def _dedup_key(card_in: CardCreate) -> str:
    return normalize_front(card_in.front or card_in.text or "")


def _create_card(db: Session, card_in: CardCreate) -> Card:
    key = _dedup_key(card_in)
    existing = db.scalar(
        select(Card).where(Card.front_normalized == key, Card.language == card_in.language)
    )
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"card already exists: {existing.id}")

    card = Card(
        type=card_in.type,
        front=card_in.front,
        back=card_in.back,
        text=card_in.text,
        front_normalized=key,
        language=card_in.language,
        context=card_in.context,
        source_session=card_in.source_session,
        tags=card_in.tags,
        **new_card_fsrs_state(),
    )
    db.add(card)
    return card


@router.post("", response_model=CardOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_hermes)])
def create_card(card_in: CardCreate, db: Session = Depends(get_db)) -> Card:
    card = _create_card(db, card_in)
    db.commit()
    db.refresh(card)
    return card


@router.post("/batch", response_model=list[CardOut], dependencies=[Depends(require_hermes)])
def create_cards_batch(batch: CardBatchCreate, db: Session = Depends(get_db)) -> list[Card]:
    created = [_create_card(db, card_in) for card_in in batch.cards]
    db.commit()
    for card in created:
        db.refresh(card)
    return created


@router.get("/recent", response_model=list[CardOut], dependencies=[Depends(require_hermes)])
def list_recent_cards(
    lang: str | None = Query(default=None, alias="lang"),
    limit: int = Query(default=20, le=100),
    db: Session = Depends(get_db),
) -> list[Card]:
    """Backs the Hermes skill's list_recent_cards tool — lets it check what it already created
    this session (or recently) before deciding whether to add another card."""
    stmt = select(Card).order_by(Card.created_at.desc()).limit(limit)
    if lang:
        stmt = stmt.where(Card.language == lang)
    return list(db.scalars(stmt))


@router.get("/due", response_model=list[CardOut], dependencies=[Depends(require_any_client)])
def list_due_cards(
    lang: str | None = Query(default=None, alias="lang"),
    limit: int = Query(default=20, le=100),
    db: Session = Depends(get_db),
) -> list[Card]:
    stmt = select(Card).where(Card.due <= datetime.now(timezone.utc)).order_by(Card.due).limit(limit)
    if lang:
        stmt = stmt.where(Card.language == lang)
    return list(db.scalars(stmt))


@router.get("/{card_id}", response_model=CardOut, dependencies=[Depends(require_any_client)])
def get_card(card_id: uuid.UUID, db: Session = Depends(get_db)) -> Card:
    card = db.get(Card, card_id)
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "card not found")
    return card


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_any_client)])
def delete_card(card_id: uuid.UUID, db: Session = Depends(get_db)) -> None:
    card = db.get(Card, card_id)
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "card not found")
    db.delete(card)
    db.commit()
