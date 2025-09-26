"""ensure users.invite_code exists

Revision ID: 62711bfd876f
Revises: c6a1b5e2e2b1
Create Date: 2025-09-26 06:45:01.157818

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '62711bfd876f'
down_revision: Union[str, None] = 'c6a1b5e2e2b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.
    - users.invite_code 컬럼이 없으면 추가 후 NOT NULL로 설정
    - 기존 행은 기본 코드 '5858'으로 초기화 (invite_codes 테이블과 무관하게 안전하게 적용)
    멱등성 보장을 위해 실제 존재 여부를 검사한 뒤 수행한다.
    """
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = [c['name'] for c in inspector.get_columns('users')]
    if 'invite_code' not in cols:
        op.add_column('users', sa.Column('invite_code', sa.String(length=10), nullable=True))
        # 기존 행 초기화
        op.execute("UPDATE users SET invite_code='5858' WHERE invite_code IS NULL")
        # NOT NULL로 전환
        op.alter_column('users', 'invite_code', existing_type=sa.String(length=10), nullable=False)


def downgrade() -> None:
    """Downgrade schema.
    - 컬럼이 존재하면 제거
    """
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = [c['name'] for c in inspector.get_columns('users')]
    if 'invite_code' in cols:
        op.drop_column('users', 'invite_code')
