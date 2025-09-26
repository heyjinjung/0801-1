"""Auth schema consolidation (defensive, idempotent)

Revision ID: 20250926_auth_schema_consolidation
Revises: c6a1b5e2e2b1
Create Date: 2025-09-26

This migration codifies manual hotfixes and aligns live schemas with ORM expectations.
It is defensive/idempotent so it can run safely across drifted environments.

Includes:
- user_sessions: ensure session_token/refresh_token/last_used_at columns, indexes; relax legacy token NOT NULL
- token_blacklist: ensure table and indexes exist
- refresh_tokens: ensure table, indexes and NOT NULL user_id when possible
- invite_codes: handle legacy 'uses' -> 'used_count' normalization
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "20250926_auth_schema_consolidation"
down_revision: Union[str, None] = "c6a1b5e2e2b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(insp, name: str) -> bool:
    try:
        return name in set(insp.get_table_names())
    except Exception:
        return False


def _has_column(insp, table: str, col: str) -> bool:
    try:
        return any(c["name"] == col for c in insp.get_columns(table))
    except Exception:
        return False


def upgrade() -> None:  # noqa: D401
    bind = op.get_bind()
    insp = inspect(bind)

    # 1) user_sessions alignment
    if _has_table(insp, "user_sessions"):
        # Add session_token if missing
        if not _has_column(insp, "user_sessions", "session_token"):
            with op.batch_alter_table("user_sessions") as batch_op:
                batch_op.add_column(sa.Column("session_token", sa.String(length=255), nullable=True))
            # Best-effort backfill from legacy token column
            if _has_column(insp, "user_sessions", "token"):
                try:
                    bind.execute(sa.text(
                        "UPDATE user_sessions SET session_token = token WHERE session_token IS NULL"
                    ))
                except Exception:
                    pass
            # Make NOT NULL after backfill
            with op.batch_alter_table("user_sessions") as batch_op:
                try:
                    batch_op.alter_column("session_token", existing_type=sa.String(length=255), nullable=False)
                except Exception:
                    pass
        # Ensure unique index on session_token
        try:
            existing_idx_list = insp.get_indexes("user_sessions")
            existing_idx = {ix["name"] for ix in existing_idx_list}
            existing_cols_sets = {tuple(ix.get("column_names") or []) for ix in existing_idx_list}
        except Exception:
            existing_idx = set()
            existing_cols_sets = set()
        if ("ix_user_sessions_session_token" not in existing_idx 
                and ("session_token",) not in existing_cols_sets):
            op.create_index("ix_user_sessions_session_token", "user_sessions", ["session_token"], unique=True)

        # Add refresh_token if missing + unique index
        if not _has_column(insp, "user_sessions", "refresh_token"):
            with op.batch_alter_table("user_sessions") as batch_op:
                batch_op.add_column(sa.Column("refresh_token", sa.String(length=255), nullable=True))
        try:
            existing_idx_list = insp.get_indexes("user_sessions")
            existing_idx = {ix["name"] for ix in existing_idx_list}
            existing_cols_sets = {tuple(ix.get("column_names") or []) for ix in existing_idx_list}
        except Exception:
            existing_idx = set()
            existing_cols_sets = set()
        if ("ix_user_sessions_refresh_token" not in existing_idx 
                and ("refresh_token",) not in existing_cols_sets):
            op.create_index("ix_user_sessions_refresh_token", "user_sessions", ["refresh_token"], unique=True)

        # Add last_used_at if missing and backfill with created_at
        if not _has_column(insp, "user_sessions", "last_used_at"):
            with op.batch_alter_table("user_sessions") as batch_op:
                batch_op.add_column(sa.Column("last_used_at", sa.DateTime(), nullable=True))
            if _has_column(insp, "user_sessions", "created_at"):
                try:
                    bind.execute(sa.text(
                        "UPDATE user_sessions SET last_used_at = created_at WHERE last_used_at IS NULL"
                    ))
                except Exception:
                    pass

        # Relax legacy token NOT NULL constraint if still present
        if _has_column(insp, "user_sessions", "token"):
            # Try making it nullable to avoid insert conflicts when unused
            try:
                with op.batch_alter_table("user_sessions") as batch_op:
                    batch_op.alter_column("token", nullable=True)
            except Exception:
                pass

    # 2) token_blacklist table and indexes
    if not _has_table(insp, "token_blacklist"):
        op.create_table(
            "token_blacklist",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("token", sa.String(length=255), nullable=False),
            sa.Column("jti", sa.String(length=36), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("blacklisted_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("blacklisted_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("reason", sa.String(length=100), nullable=True),
            sa.UniqueConstraint("token"),
            sa.UniqueConstraint("jti"),
        )
        op.create_index("ix_token_blacklist_token", "token_blacklist", ["token"], unique=False)
        op.create_index("ix_token_blacklist_jti", "token_blacklist", ["jti"], unique=False)
    else:
        # Ensure indexes exist (avoid duplicates by column set)
        try:
            tb_idx_list = insp.get_indexes("token_blacklist")
            tb_indexes = {ix["name"] for ix in tb_idx_list}
            tb_cols_sets = {tuple(ix.get("column_names") or []) for ix in tb_idx_list}
        except Exception:
            tb_indexes = set()
            tb_cols_sets = set()
        if ("ix_token_blacklist_token" not in tb_indexes and ("token",) not in tb_cols_sets):
            op.create_index("ix_token_blacklist_token", "token_blacklist", ["token"], unique=False)
        if ("ix_token_blacklist_jti" not in tb_indexes and ("jti",) not in tb_cols_sets):
            op.create_index("ix_token_blacklist_jti", "token_blacklist", ["jti"], unique=False)

    # 3) refresh_tokens table/schema
    if not _has_table(insp, "refresh_tokens"):
        op.create_table(
            "refresh_tokens",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("token", sa.String(length=255), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("is_revoked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.UniqueConstraint("token"),
        )
        op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"], unique=False)
    else:
        # Ensure token unique index and user_id index exist
        try:
            rt_idx_list = insp.get_indexes("refresh_tokens")
            rt_indexes = {ix["name"] for ix in rt_idx_list}
            rt_cols_sets = {tuple(ix.get("column_names") or []) for ix in rt_idx_list}
        except Exception:
            rt_indexes = set()
            rt_cols_sets = set()
        if ("ix_refresh_tokens_token" not in rt_indexes and ("token",) not in rt_cols_sets):
            op.create_index("ix_refresh_tokens_token", "refresh_tokens", ["token"], unique=True)
        if ("ix_refresh_tokens_user_id" not in rt_indexes and ("user_id",) not in rt_cols_sets):
            op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"], unique=False)
        # Try to enforce NOT NULL on user_id when there are no NULLs
        try:
            null_count = bind.execute(sa.text("SELECT COUNT(*) FROM refresh_tokens WHERE user_id IS NULL")).scalar()  # type: ignore
        except Exception:
            null_count = 0
        if null_count == 0:
            try:
                with op.batch_alter_table("refresh_tokens") as batch_op:
                    batch_op.alter_column("user_id", existing_type=sa.Integer(), nullable=False)
            except Exception:
                pass

    # 4) invite_codes normalization: legacy 'uses' -> 'used_count'
    if _has_table(insp, "invite_codes"):
        cols = {c["name"] for c in insp.get_columns("invite_codes")}
        if "used_count" not in cols and "uses" in cols:
            with op.batch_alter_table("invite_codes") as batch_op:
                batch_op.add_column(sa.Column("used_count", sa.Integer(), nullable=False, server_default="0"))
            try:
                bind.execute(sa.text(
                    "UPDATE invite_codes SET used_count = COALESCE(used_count, 0) + COALESCE(uses, 0)"
                ))
            except Exception:
                pass
            # Drop server default (keep NOT NULL)
            try:
                with op.batch_alter_table("invite_codes") as batch_op:
                    batch_op.alter_column("used_count", server_default=None)
            except Exception:
                pass
            # Best-effort drop of legacy 'uses'
            try:
                with op.batch_alter_table("invite_codes") as batch_op:
                    batch_op.drop_column("uses")
            except Exception:
                pass


def downgrade() -> None:  # noqa: D401
    # Best-effort partial rollback. Only drops artifacts that are safe to remove.
    insp = inspect(op.get_bind())

    if _has_table(insp, "invite_codes") and _has_column(insp, "invite_codes", "used_count"):
        # Cannot restore legacy 'uses' reliably; keep used_count.
        pass

    if _has_table(insp, "refresh_tokens"):
        try:
            op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
        except Exception:
            pass
        try:
            op.drop_index("ix_refresh_tokens_token", table_name="refresh_tokens")
        except Exception:
            pass
        # Do not drop the table in downgrade to avoid data loss

    if _has_table(insp, "token_blacklist"):
        try:
            op.drop_index("ix_token_blacklist_token", table_name="token_blacklist")
        except Exception:
            pass
        try:
            op.drop_index("ix_token_blacklist_jti", table_name="token_blacklist")
        except Exception:
            pass
        # Do not drop table

    if _has_table(insp, "user_sessions"):
        try:
            op.drop_index("ix_user_sessions_session_token", table_name="user_sessions")
        except Exception:
            pass
        try:
            op.drop_index("ix_user_sessions_refresh_token", table_name="user_sessions")
        except Exception:
            pass
        # Keep columns; no destructive column drops to avoid data loss
