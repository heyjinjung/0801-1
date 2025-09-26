"""ensure users.invite_code add column v3 (idempotent)

Revision ID: c36e6cbf64d2
Revises: b555ac226394
Create Date: 2025-09-26 07:11:48.805648

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c36e6cbf64d2'
down_revision: Union[str, None] = 'b555ac226394'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema (v3).
    - 이전 리비전이 런타임 환경에서 적용되지 않았을 가능성 방어
    - invite_code 컬럼이 없으면 추가 → 기본값 채움 → NOT NULL 시도
    """
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'users' not in inspector.get_table_names():
        return
    cols = {c['name'] for c in inspector.get_columns('users')}
    if 'invite_code' not in cols:
        op.add_column('users', sa.Column('invite_code', sa.String(length=10), nullable=True))
        try:
            op.execute("UPDATE users SET invite_code='5858' WHERE invite_code IS NULL")
        except Exception:
            pass
        try:
            op.alter_column('users', 'invite_code', existing_type=sa.String(length=10), nullable=False)
        except Exception:
            pass


def downgrade() -> None:
    """Downgrade schema.
    - invite_code 컬럼이 있을 때만 제거
    """
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    try:
        cols = {c['name'] for c in inspector.get_columns('users')}
    except Exception:
        cols = set()
    if 'invite_code' in cols:
        try:
            op.drop_column('users', 'invite_code')
        except Exception:
            pass
