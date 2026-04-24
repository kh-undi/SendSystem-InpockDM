// [요청] Supabase 메인 DB 이전 — increment_weekly_count RPC 원자성/동시성 테스트
// 가상 week_key('9999-W99')로 실데이터 건드리지 않고 검증.
const { supabase } = require('../src/db');

const TEST_ACCOUNT_ID = 1;
const TEST_WEEK = '9999-W99';

async function cleanup() {
  await supabase.from('weekly_tracking')
    .delete().eq('account_id', TEST_ACCOUNT_ID).eq('week_key', TEST_WEEK);
}

async function getCount() {
  const { data } = await supabase.from('weekly_tracking')
    .select('count')
    .eq('account_id', TEST_ACCOUNT_ID).eq('week_key', TEST_WEEK).maybeSingle();
  return data ? data.count : null;
}

async function increment() {
  const { data, error } = await supabase.rpc('increment_weekly_count', {
    p_account_id: TEST_ACCOUNT_ID, p_week_key: TEST_WEEK,
  });
  if (error) throw error;
  return data;
}

async function main() {
  await cleanup();
  console.log('[setup] 테스트 row 삭제 완료');

  // 1) 단일 호출: 존재하지 않던 row → count=1 반환
  const r1 = await increment();
  console.log(`[test1] 최초 increment → ${r1} (기대: 1)`);

  // 2) 연속 호출: count=2 반환
  const r2 = await increment();
  console.log(`[test2] 재호출 → ${r2} (기대: 2)`);

  // 3) 동시성 테스트: 10번 병렬 호출 → 최종 12이어야 함
  const promises = Array.from({ length: 10 }, () => increment());
  const results = await Promise.all(promises);
  const finalCount = await getCount();
  console.log(`[test3] 10병렬 호출 반환값들: [${results.sort((a, b) => a - b).join(', ')}]`);
  console.log(`[test3] 최종 count: ${finalCount} (기대: 12)`);

  // 판정
  const allOk = r1 === 1 && r2 === 2 && finalCount === 12
    && results.length === 10
    && new Set(results).size === 10  // 모든 반환값이 고유 (3,4,...,12)
    && Math.min(...results) === 3 && Math.max(...results) === 12;

  if (allOk) console.log('\n[OK] 원자적 증가 보장됨 — 레이스 컨디션 없음');
  else       console.log('\n[FAIL] 기대와 다름');

  await cleanup();
  console.log('[cleanup] 테스트 row 삭제 완료');
}

main().catch(e => { console.error('[error]', e.message || e); process.exit(1); });
