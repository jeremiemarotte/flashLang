import unicodedata
from datetime import datetime, timezone

from fsrs import Card as FSRSCard
from fsrs import Rating, Scheduler, State

from app.models import Card

scheduler = Scheduler()  # default weights/parameters at MVP, per PRD (no personalization yet)


def normalize_front(text: str) -> str:
    """Case/accent-insensitive key used for the dedup check on POST /cards."""
    stripped = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return stripped.strip().lower()


def new_card_fsrs_state() -> dict:
    """FSRS fields for a freshly created card, due immediately."""
    fresh = FSRSCard()
    return {
        "due": fresh.due,
        "fsrs_state": fresh.state.value,
        "fsrs_step": fresh.step,
        "stability": fresh.stability,
        "difficulty": fresh.difficulty,
        "last_review": fresh.last_review,
    }


def apply_review(card: Card, rating: int) -> float:
    """Run the FSRS scheduler for one review, mutate `card` in place, return the applied interval in days."""
    fsrs_card = FSRSCard(
        card_id=0,  # unused, we key everything by our own Card.id
        state=State(card.fsrs_state),
        step=card.fsrs_step,
        stability=card.stability,
        difficulty=card.difficulty,
        due=card.due,
        last_review=card.last_review,
    )

    updated, _log = scheduler.review_card(fsrs_card, Rating(rating), review_datetime=datetime.now(timezone.utc))

    interval_days = (updated.due - updated.last_review).total_seconds() / 86400

    card.due = updated.due
    card.fsrs_state = updated.state.value
    card.fsrs_step = updated.step
    card.stability = updated.stability
    card.difficulty = updated.difficulty
    card.last_review = updated.last_review
    card.reps += 1
    if rating == Rating.Again.value:
        card.lapses += 1

    return interval_days
