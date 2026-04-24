// [요청] Supabase 메인 DB 이전 — repliesRepo dual-mode 읽기 비교
const config = require('../config');
const repliesRepo = require('../src/repo/repliesRepo');

async function snap(mode) {
  config.USE_SUPABASE = mode === 'supabase';
  return repliesRepo.getLatest();
}

async function main() {
  const j = await snap('json');
  const d = await snap('supabase');

  console.log('--- JSON getLatest() ---');
  console.log(j ? {
    checkedAt: j.checkedAt,
    partial: j.partial,
    resultCount: j.results.length,
    firstResult: j.results[0],
  } : null);

  console.log('\n--- DB getLatest() ---');
  console.log(d ? {
    checkedAt: d.checkedAt,
    partial: d.partial,
    resultCount: d.results.length,
    firstResult: d.results[0],
  } : null);

  if (j && d) {
    const sameCount = j.results.length === d.results.length;
    const samePartial = j.partial === d.partial;
    console.log(`\n건수 일치: ${sameCount}, partial 일치: ${samePartial}`);
  }
}
main().catch(e => { console.error('[error]', e.message || e); process.exit(1); });
