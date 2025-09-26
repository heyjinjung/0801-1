
import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from dotenv import load_dotenv
load_dotenv() # Load .env file

from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Import Base directly from models.py instead of models package
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.models import Base
target_metadata = Base.metadata # Configure Alembic to use your models' metadata

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
# from myapp import mymodel
# target_metadata = mymodel.Base.metadata
# target_metadata = None # This line is now handled above

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.

def get_database_url():
    """환경에 따른 데이터베이스 URL 반환"""
    # Docker/Production environment - PostgreSQL
    postgres_server = os.getenv('POSTGRES_SERVER')
    postgres_user = os.getenv('POSTGRES_USER')
    postgres_password = os.getenv('POSTGRES_PASSWORD')
    postgres_db = os.getenv('POSTGRES_DB')
    
    if postgres_server and postgres_user and postgres_password and postgres_db:
        return f"postgresql://{postgres_user}:{postgres_password}@{postgres_server}:5432/{postgres_db}"
    
    # Fallback to legacy environment variables
    if os.getenv('DB_HOST'):
        db_host = os.getenv('DB_HOST', 'localhost')
        db_port = os.getenv('DB_PORT', '5432')
        db_name = os.getenv('DB_NAME', 'cc_webapp')
        db_user = os.getenv('DB_USER', 'cc_user')
        db_password = os.getenv('DB_PASSWORD', 'cc_password')
        return f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    
    # 개발 환경 fallback - SQLite
    return os.getenv("DATABASE_URL", "sqlite:///./auth.db")

db_url = get_database_url()
print(f"🗄️ Alembic 데이터베이스 URL: {db_url.split('@')[-1] if '@' in db_url else db_url}")


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    # url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=db_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    # connectable = engine_from_config(
    #     config.get_section(config.config_ini_section, {}),
    #     prefix="sqlalchemy.",
    #     poolclass=pool.NullPool,
    # )

    # Create a new section in the config for the database URL
    # if it doesn't already exist.
    section = config.config_ini_section
    if not config.get_section(section): # Changed has_section to get_section
        config.add_section(section)
    config.set_section_option(section, "sqlalchemy.url", db_url)

    connectable = engine_from_config(
        config.get_section(section), # Use the modified section
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        # 테스트/CI에서 락 대기 행업 방지: 짧은 lock_timeout 적용 (PostgreSQL 한정)
        try:
            if connection.dialect.name == "postgresql":
                # 락 타임아웃은 짧게 유지하되,
                # 마이그레이션 롤백을 유발하던 statement_timeout(5s)을 해제(0)하여 장시간 DDL 허용
                connection.exec_driver_sql("SET lock_timeout TO '5s'")
                connection.exec_driver_sql("SET statement_timeout TO '0'")
                print("[alembic] lock_timeout=5s, statement_timeout=0 적용")
        except Exception as e:
            print(f"[alembic] timeout 설정 실패: {e}")

        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
