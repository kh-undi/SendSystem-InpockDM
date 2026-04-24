// [요청] Supabase 메인 DB 이전 — sentLogRepo 경유로 변경 (dual-mode)
const sentLogRepo = require('./repo/sentLogRepo');

/**
 * 발송 성공 로그 기록
 * Supabase 모드: sent_log 테이블에 insert
 * JSON 모드: logs/sent.log에 append (기존 동작)
 */
async function logSent(accountId, influencer) {
  await sentLogRepo.append(accountId, influencer);
}

module.exports = { logSent };
