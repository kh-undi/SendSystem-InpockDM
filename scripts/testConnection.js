// [요청] Supabase 메인 DB 이전 — 연결 테스트
// Storage 버킷 목록을 조회해서 URL과 service_role key가 유효한지 확인한다.
// 테이블이 아직 없어도 이 스크립트는 동작해야 한다.
const { supabase } = require('../src/db');

async function main() {
  console.log('[test] SUPABASE_URL =', process.env.SUPABASE_URL);
  console.log('[test] service_role key 길이 =', (process.env.SUPABASE_SERVICE_ROLE_KEY || '').length);

  const { data, error } = await supabase.storage.listBuckets();
  if (error) {
    console.error('[test] 실패:', error.message);
    process.exit(1);
  }

  const names = data.map(b => b.name);
  console.log('[test] 성공. 버킷 목록:', names.length ? names.join(', ') : '(없음)');

  const expected = ['product-photos', 'signatures'];
  const missing = expected.filter(n => !names.includes(n));
  if (missing.length) {
    console.warn('[test] 주의: 다음 버킷이 없습니다:', missing.join(', '));
    console.warn('       Supabase Dashboard → Storage에서 생성해 주세요.');
  } else {
    console.log('[test] 필수 버킷 2개 모두 존재 확인.');
  }
}

main().catch(e => {
  console.error('[test] 예외:', e);
  process.exit(1);
});
