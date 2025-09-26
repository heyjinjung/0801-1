"""merge heads: auth consolidation + invite_code v3

Revision ID: 20250926_merge_heads_auth_invite
Revises: 20250926_auth_schema_consolidation, c36e6cbf64d2
Create Date: 2025-09-26

This is a no-op merge revision to unify parallel heads into a single lineage.
"""
from __future__ import annotations

from typing import Sequence, Union

# Alembic identifiers
revision: str = "20250926_merge_heads_auth_invite"
down_revision: Union[str, tuple[str, ...]] = ("20250926_auth_schema_consolidation", "c36e6cbf64d2")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:  # noqa: D401
    # No schema changes; merge only
    pass


def downgrade() -> None:  # noqa: D401
    # Cannot un-merge without manual intervention
    pass
