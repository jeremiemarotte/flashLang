import uuid
from datetime import datetime

from sqlalchemy import ARRAY, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Card(Base):
    __tablename__ = "cards"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type: Mapped[str] = mapped_column(String(10))  # "basic" | "cloze"
    front: Mapped[str | None] = mapped_column(Text, nullable=True)
    back: Mapped[str | None] = mapped_column(Text, nullable=True)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)  # cloze, e.g. "I {{c1::used to}} live there"
    front_normalized: Mapped[str] = mapped_column(Text)  # lowercased/accent-stripped, used for dedup
    language: Mapped[str] = mapped_column(String(2))  # "en" | "es"
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_session: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # FSRS state
    due: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    fsrs_state: Mapped[int] = mapped_column(Integer, default=1)  # fsrs.State enum value
    fsrs_step: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stability: Mapped[float | None] = mapped_column(Float, nullable=True)
    difficulty: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_review: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reps: Mapped[int] = mapped_column(Integer, default=0)
    lapses: Mapped[int] = mapped_column(Integer, default=0)

    reviews: Mapped[list["Review"]] = relationship(back_populates="card", cascade="all, delete-orphan")


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    card_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"))
    rating: Mapped[int] = mapped_column(Integer)  # fsrs.Rating enum value (1-4)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    interval_days: Mapped[float] = mapped_column(Float)  # days between reviewed_at and the new due date

    card: Mapped["Card"] = relationship(back_populates="reviews")
