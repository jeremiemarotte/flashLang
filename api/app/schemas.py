import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator


class CardCreate(BaseModel):
    type: Literal["basic", "cloze"]
    front: str | None = None
    back: str | None = None
    text: str | None = None
    language: Literal["en", "es"]
    domain: Literal["language", "culture"] = "language"
    context: str | None = None
    source_session: str | None = None
    tags: list[str] = []

    @model_validator(mode="after")
    def check_fields_for_type(self) -> "CardCreate":
        if self.type == "basic" and not (self.front and self.back):
            raise ValueError("basic cards require both 'front' and 'back'")
        if self.type == "cloze" and not self.text:
            raise ValueError("cloze cards require 'text'")
        return self


class CardBatchCreate(BaseModel):
    cards: list[CardCreate]


class CardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    front: str | None
    back: str | None
    text: str | None
    language: str
    domain: str
    context: str | None
    source_session: str | None
    tags: list[str]
    created_at: datetime
    due: datetime
    stability: float | None
    difficulty: float | None
    reps: int
    lapses: int
    last_review: datetime | None


class ReviewCreate(BaseModel):
    card_id: uuid.UUID
    rating: Literal[1, 2, 3, 4]  # Again, Hard, Good, Easy


class ReviewOut(BaseModel):
    card: CardOut
    interval_days: float


class DailyStats(BaseModel):
    due_now: int
    reviewed_today: int
    retention_today: float | None  # share of today's reviews rated Good/Easy
