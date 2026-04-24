// [요청] Supabase 메인 DB 이전 — sentLogRepo 경유
// [요청] sent.log 관련 설정 및 로그 전부 제거 — 파일 경로 폐기, Supabase sent_log 테이블만 사용
const sentLogRepo = require('./repo/sentLogRepo');

async function logSent(accountId, influencer) {
  await sentLogRepo.append(accountId, influencer);
}

module.exports = { logSent };
