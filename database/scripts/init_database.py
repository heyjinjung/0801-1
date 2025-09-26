"""
Casino-Club F2P 메인 데이터베이스 초기화 스크립트
Repository 패턴 호환 버전 - 환경변수 기반 설정 지원

회원가입 필수 입력사항: 초대코드, 사이트아이디, 닉네임, 폰번호, 비밀번호
Repository 패턴을 통한 데이터 접근 및 관리
"""
import sys
import os
import logging
from typing import Optional

# Path setup for imports
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.join(current_dir, "..", "..", "cc-webapp", "backend")
sys.path.append(backend_dir)

# Environment variables
DB_INIT_MODE = os.getenv('DB_INIT_MODE', 'development')
CREATE_TEST_DATA = os.getenv('CREATE_TEST_DATA', 'true').lower() == 'true'
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'admin123')
TEST_PASSWORD = os.getenv('TEST_PASSWORD', 'test123')
DEFAULT_INVITE_CODE = os.getenv('DEFAULT_INVITE_CODE')
if not DEFAULT_INVITE_CODE:
    raise SystemExit("DEFAULT_INVITE_CODE 미설정: 안전한 값을 환경변수로 지정하세요.")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    from app.database import engine, SessionLocal, Base
    from app.models.auth_models import User
    from app.models.invite_code import InviteCode
    from app.services.auth_service import AuthService
    from app.repositories import UserRepository, AuthRepository
    from sqlalchemy.orm import Session
except ImportError as e:
    logger.error(f"Import error: {e}")
    logger.error("Please ensure you're running from the correct directory and dependencies are installed")
    sys.exit(1)

def create_admin_user(db: Session, user_repo: UserRepository) -> User:
    """관리자 계정 생성"""
    try:
        admin_user = User(
            site_id="admin",
            nickname="관리자",
            phone_number="01000000000",
            hashed_password=AuthService.get_password_hash(ADMIN_PASSWORD),
            full_name="시스템 관리자",
            invite_code=DEFAULT_INVITE_CODE,
            is_admin=True,
            is_active=True
        )
        
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)
        
        logger.info(f"✅ 관리자 계정 생성 완료: admin / {ADMIN_PASSWORD}")
        return admin_user
        
    except Exception as e:
        logger.error(f"❌ 관리자 계정 생성 실패: {e}")
        db.rollback()
        raise


def create_invite_code(db: Session, admin_user: User) -> InviteCode:
    """초대코드 생성"""
    try:
        invite_code = InviteCode(
            code=DEFAULT_INVITE_CODE,
            created_by=admin_user.id,
            max_uses=999999,
            current_uses=0,
            is_active=True
        )
        db.add(invite_code)
        db.commit()
        
        logger.info(f"✅ 초대코드 생성 완료: {DEFAULT_INVITE_CODE} (무제한)")
        return invite_code
        
    except Exception as e:
        logger.error(f"❌ 초대코드 생성 실패: {e}")
        db.rollback()
        raise


def create_test_user(db: Session, user_repo: UserRepository) -> Optional[User]:
    """테스트 사용자 생성 (개발 환경에서만)"""
    if not CREATE_TEST_DATA:
        logger.info("⏭️ 테스트 데이터 생성 건너뜀 (CREATE_TEST_DATA=false)")
        return None
        
    try:
        test_user = User(
            site_id="testuser",
            nickname="테스터",
            phone_number="01012345678",
            hashed_password=AuthService.get_password_hash(TEST_PASSWORD),
            full_name="테스트 사용자",
            invite_code=DEFAULT_INVITE_CODE,
            is_admin=False,
            is_active=True
        )
        
        db.add(test_user)
        db.commit()
        db.refresh(test_user)
        
        logger.info(f"✅ 테스트 계정 생성 완료: testuser / {TEST_PASSWORD}")
        logger.info(f"   - 닉네임: 테스터")
        logger.info(f"   - 폰번호: 01012345678")
        return test_user
        
    except Exception as e:
        logger.error(f"❌ 테스트 계정 생성 실패: {e}")
        db.rollback()
        raise


def verify_initialization(db: Session) -> bool:
    """초기화 결과 검증"""
    try:
        # 관리자 계정 확인
        admin = db.query(User).filter(User.site_id == "admin").first()
        if not admin:
            logger.error("❌ 관리자 계정이 생성되지 않았습니다")
            return False
            
        # 초대코드 확인
        invite = db.query(InviteCode).filter(InviteCode.code == DEFAULT_INVITE_CODE).first()
        if not invite:
            logger.error("❌ 초대코드가 생성되지 않았습니다")
            return False
            
        # 테스트 계정 확인 (CREATE_TEST_DATA가 true인 경우만)
        if CREATE_TEST_DATA:
            test_user = db.query(User).filter(User.site_id == "testuser").first()
            if not test_user:
                logger.error("❌ 테스트 계정이 생성되지 않았습니다")
                return False
                
        logger.info("✅ 초기화 검증 완료 - 모든 필수 데이터가 정상적으로 생성되었습니다")
        return True
        
    except Exception as e:
        logger.error(f"❌ 초기화 검증 실패: {e}")
        return False


def init_database():
    """메인 데이터베이스 초기화 함수"""
    logger.info("🔄 Casino-Club F2P 데이터베이스 초기화 시작...")
    logger.info(f"📊 초기화 모드: {DB_INIT_MODE}")
    logger.info(f"🧪 테스트 데이터 생성: {CREATE_TEST_DATA}")
    
    try:
        # 모든 테이블 삭제 후 재생성
        logger.info("🗑️ 기존 테이블 삭제 중...")
        Base.metadata.drop_all(bind=engine)
        
        logger.info("🏗️ 새 테이블 생성 중...")
        Base.metadata.create_all(bind=engine)
        logger.info("✅ 데이터베이스 테이블 생성 완료")
        
        # 세션 및 Repository 생성
        db = SessionLocal()
        user_repo = UserRepository(db)
        auth_repo = AuthRepository(db)
        
        try:
            # 관리자 계정 생성
            admin_user = create_admin_user(db, user_repo)
            
            # 초대코드 생성  
            invite_code = create_invite_code(db, admin_user)
            
            # 테스트 사용자 생성 (조건부)
            test_user = create_test_user(db, user_repo)
            
            # 초기화 검증
            if verify_initialization(db):
                logger.info("🎉 데이터베이스 초기화 완료!")
                logger.info(f"🔑 관리자 로그인: admin / {ADMIN_PASSWORD}")
                if CREATE_TEST_DATA:
                    logger.info(f"🧪 테스트 로그인: testuser / {TEST_PASSWORD}")
                logger.info(f"📧 초대코드: {DEFAULT_INVITE_CODE}")
            else:
                logger.error("❌ 초기화 검증 실패")
                return False
                
        except Exception as e:
            logger.error(f"❌ 데이터베이스 초기화 실패: {e}")
            db.rollback()
            return False
        finally:
            db.close()
            
        return True
        
    except Exception as e:
        logger.error(f"❌ 데이터베이스 연결 실패: {e}")
        return False

if __name__ == "__main__":
    init_database()
