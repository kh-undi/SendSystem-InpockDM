// [요청] Supabase 메인 DB 이전 — influencersRepo dual-mode 읽기 비교 테스트
const config = require('../config');
const influencersRepo = require('../src/repo/influencersRepo');

async function snapshot(mode) {
  config.USE_SUPABASE = mode === 'supabase';
  return {
    pending: await influencersRepo.listPending(),
    failed: await influencersRepo.listFailed(),
  };
}

function key(i) { return `${i.nickname}|${i.profileUrl}`; }

async function main() {
  const j = await snapshot('json');
  const d = await snapshot('supabase');

  console.log('=== 행 수 비교 ===');
  console.log(`          JSON   Supabase`);
  console.log(`pending:  ${String(j.pending.length).padStart(4)}   ${String(d.pending.length).padStart(4)}`);
  console.log(`failed:   ${String(j.failed.length).padStart(4)}   ${String(d.failed.length).padStart(4)}`);

  const jPending = new Set(j.pending.map(key));
  const dPending = new Set(d.pending.map(key));
  const onlyJsonPending = [...jPending].filter(k => !dPending.has(k));
  const onlyDbPending = [...dPending].filter(k => !jPending.has(k));

  const jFailed = new Set(j.failed.map(key));
  const dFailed = new Set(d.failed.map(key));
  const onlyJsonFailed = [...jFailed].filter(k => !dFailed.has(k));
  const onlyDbFailed = [...dFailed].filter(k => !jFailed.has(k));

  console.log('\n=== pending 차집합 ===');
  console.log(`JSON only: ${onlyJsonPending.length}, DB only: ${onlyDbPending.length}`);
  console.log('\n=== failed 차집합 ===');
  console.log(`JSON only: ${onlyJsonFailed.length}, DB only: ${onlyDbFailed.length}`);

  console.log('\n--- JSON pending[0] ---');
  console.log(j.pending[0]);
  console.log('--- DB pending[0] ---');
  console.log(d.pending[0]);

  console.log('\n--- JSON failed[0] ---');
  console.log(j.failed[0]);
  console.log('--- DB failed[0] ---');
  console.log(d.failed[0]);

  const ok = !onlyJsonPending.length && !onlyDbPending.length
          && !onlyJsonFailed.length && !onlyDbFailed.length;
  console.log(ok ? '\n[OK] 양쪽 모드 동일한 nickname+profileUrl 집합' : '\n[WARN] 차이 있음');
}

main().catch(e => { console.error('[error]', e.message || e); process.exit(1); });
