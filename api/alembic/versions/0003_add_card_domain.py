"""add domain field to cards, scope dedup by domain

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-11

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "cards",
        sa.Column("domain", sa.String(length=20), nullable=False, server_default="language"),
    )

    op.drop_index("ix_cards_dedup", table_name="cards")
    op.create_index(
        "ix_cards_dedup", "cards", ["language", "domain", "front_normalized"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_cards_dedup", table_name="cards")
    op.create_index("ix_cards_dedup", "cards", ["language", "front_normalized"], unique=True)
    op.drop_column("cards", "domain")
