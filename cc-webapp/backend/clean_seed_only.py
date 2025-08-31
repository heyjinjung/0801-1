"""시드계정만 남기고 모든 가짜 데이터 정리 스크립트

목적:
- 가짜 시드 데이터 모두 삭제
- 시드계정(admin, user001~004)만 유지
- 깨끗한 상태에서 실제 활동 반영 가능하도록

사용:
    docker compose exec backend python clean_seed_only.py
"""

from sqlalchemy import text
from app.database import SessionLocal
from app.models.auth_models import User

def main():
    """시드계정만 남기고 모든 데이터 정리"""
    
    # 1. 시드계정 ID 확인
    db = SessionLocal()
    try:
        seed_accounts = ['admin', 'user001', 'user002', 'user003', 'user004']
        seed_users = db.query(User).filter(User.site_id.in_(seed_accounts)).all()
        seed_user_ids = [u.id for u in seed_users]
        
        print(f"🔧 시드계정 확인: {len(seed_user_ids)}개")
        for u in seed_users:
            print(f"  - {u.site_id} (ID: {u.id}): {u.nickname}")
        
        if len(seed_user_ids) != 5:
            print("❌ 시드계정이 모자랍니다. 먼저 seed_basic_accounts를 실행하세요.")
            return
            
    except Exception as e:
        print(f"❌ 시드계정 확인 실패: {e}")
        return

    # 2. 엔진으로 대량 정리 작업
    engine = db.get_bind()
    
    try:
        with engine.begin() as conn:
            print("\n🧹 가짜 데이터 정리 시작...")
            
            # 존재하는 테이블만 확인하고 정리
            existing_tables = []
            
            # 테이블 존재 여부 확인
            tables_to_check = [
                'game_sessions',
                'user_actions', 
                'user_game_stats',
                'shop_transactions',
                'user_rewards',
                'user_segments',
                'battlepass_status',
                'notifications'
            ]
            
            for table in tables_to_check:
                try:
                    conn.execute(text(f"SELECT 1 FROM {table} LIMIT 1"))
                    existing_tables.append(table)
                except:
                    print(f"  ⚠️ {table}: 테이블 없음")
            
            print(f"  📋 정리할 테이블: {existing_tables}")
            
            # 존재하는 테이블만 정리
            for table in existing_tables:
                try:
                    result = conn.execute(text(f"""
                        DELETE FROM {table} 
                        WHERE user_id NOT IN ({','.join(map(str, seed_user_ids))})
                    """))
                    print(f"  ✅ {table}: {result.rowcount}건 삭제")
                except Exception as e:
                    print(f"  ⚠️ {table}: 삭제 오류 ({e})")
            
            # 시드계정이 아닌 모든 사용자 삭제
            try:
                result = conn.execute(text(f"""
                    DELETE FROM users 
                    WHERE id NOT IN ({','.join(map(str, seed_user_ids))})
                """))
                print(f"  ✅ users: {result.rowcount}개 계정 삭제 (시드계정 제외)")
            except Exception as e:
                print(f"  ⚠️ users 삭제 실패: {e}")
            
            # 시드계정들 초기 상태로 리셋
            try:
                conn.execute(text(f"""
                    UPDATE users 
                    SET gold_balance = 1000,
                        total_spent = 0,
                        vip_tier = 'STANDARD',
                        battlepass_level = 1
                    WHERE id IN ({','.join(map(str, seed_user_ids))})
                """))
                print(f"  ✅ 시드계정 상태 초기화 완료")
            except Exception as e:
                print(f"  ⚠️ 시드계정 초기화 실패: {e}")
            
        print("\n🎉 정리 완료! 이제 깨끗한 상태에서 실제 활동을 시작할 수 있습니다.")
        print("\n📋 시드계정 로그인 정보:")
        print("  관리자: admin / 123456")
        print("  유저1: user001 / 123455")  
        print("  유저2: user002 / 123455")
        print("  유저3: user003 / 123455")
        print("  유저4: user004 / 123455")
        
    except Exception as e:
        print(f"❌ 정리 작업 실패: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
