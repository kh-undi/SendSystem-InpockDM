// [요청] Supabase 메인 DB 이전 — sent_log repo (append-only)
// [요청] sent.log 관련 설정 및 로그 전부 제거 — JSON 파일(logs/sent.log) 경로 폐기, Supabase 테이블만 사용
const { supabase } = require('../db');

async function append(accountId, influencer) {
  // accountId가 "mail:1"·"dry-run" 같은 문자열일 수 있음. 정수 아니면 null로 저장.
  const n = parseInt(accountId, 10);
  const account_id = Number.isFinite(n) && String(n) === String(accountId) ? n : null;
  const { error } = await supabase.from('sent_log').insert({
    account_id,
    nickname: influencer.nickname || null,
    profile_url: influencer.profileUrl || null,
    product_name: influencer.productName || null,
    sent_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function list() {
  const { data, error } = await supabase
    .from('sent_log')
    .select('sent_at, account_id, nickname, profile_url, product_name')
    .order('sent_at', { ascending: true })
    .limit(2000);
  if (error) throw error;
  return data.map(r => ({
    timestamp: r.sent_at,
    accountId: r.account_id != null ? String(r.account_id) : '',
    nickname: r.nickname || '',
    profileUrl: r.profile_url || '',
    productName: r.product_name || '',
  }));
}

module.exports = { append, list };
