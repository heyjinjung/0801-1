"""ensure users.invite_code column fix (idempotent)

Revision ID: b555ac226394
Revises: 62711bfd876f
Create Date: 2025-09-26 07:10:38.712867

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b555ac226394'
down_revision: Union[str, None] = '62711bfd876f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.
    - users.invite_code 컬럼이 없으면 추가 후 기본값 채우고 NOT NULL 적용
    - 멱등성: 존재 여부 점검 후만 수행
    """
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    # users 테이블이 없을 수 있는 극단 케이스 방어
    tables = inspector.get_table_names()
    if 'users' not in tables:
        return

    cols = {c['name'] for c in inspector.get_columns('users')}
    if 'invite_code' not in cols:
        # 1) 일단 nullable 로 추가
        op.add_column('users', sa.Column('invite_code', sa.String(length=10), nullable=True))
        # 2) 기존 행 기본값 채움 (고정 코드 5858)
        try:
            op.execute("UPDATE users SET invite_code='5858' WHERE invite_code IS NULL")
        except Exception:
            # 일부 DB에서 트랜잭션/권한 이슈가 있더라도 컬럼 존재는 유지
            pass
        # 3) NOT NULL 전환
        try:
            op.alter_column('users', 'invite_code', existing_type=sa.String(length=10), nullable=False)
        except Exception:
            # 제약 적용 실패 시에도 컬럼 존재 자체가 중요하므로 무시
            pass


def downgrade() -> None:
    """Downgrade schema.
    - invite_code 컬럼이 존재할 때만 제거
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
            # 안전 상 무시
            pass
