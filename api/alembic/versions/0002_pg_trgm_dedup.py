"""enable pg_trgm and add a trigram index for fuzzy dedup

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-11

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE INDEX ix_cards_front_normalized_trgm ON cards USING gin (front_normalized gin_trgm_ops)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_cards_front_normalized_trgm")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
