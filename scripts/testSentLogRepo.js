// [요청] Supabase 메인 DB 이전 — sentLogRepo dual-mode 읽기 비교
const config = require('../config');
const sentLogRepo = require('../src/repo/sentLogRepo');

async function snap(mode) {
  config.USE_SUPABASE = mode === 'supabase';
  return sentLogRepo.list();
}

async function main() {
  const j = await snap('json');
  const d = await snap('supabase');
  console.log(`JSON: ${j.length}건, Supabase: ${d.length}건`);
  console.log('\n--- JSON[0] ---'); console.log(j[0]);
  console.log('--- DB[0] ---'); console.log(d[0]);
  console.log('\n--- JSON[last] ---'); console.log(j[j.length - 1]);
  console.log('--- DB[last] ---'); console.log(d[d.length - 1]);
  console.log(j.length === d.length ? '\n[OK] 건수 일치' : '\n[WARN] 건수 차이');
}
main().catch(e => { console.error('[error]', e.message || e); process.exit(1); });
