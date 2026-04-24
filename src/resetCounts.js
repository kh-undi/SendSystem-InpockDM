/**
 * 모든 계정의 발송 횟수 초기화
 * 사용: npm run reset-counts
 */
// [요청] accountsRepo 경유로 변경 — USE_SUPABASE 플래그에 따라 JSON/Supabase 자동 분기
const accountsRepo = require('./repo/accountsRepo');

(async () => {
  try {
    await accountsRepo.resetAllWeeklyTracking();
    console.log('모든 계정의 발송 횟수가 초기화되었습니다.');
  } catch (e) {
    console.error('[error]', e.message || e);
    process.exit(1);
  }
})();
