// [요청] Supabase 메인 DB 이전 — emailAccountsRepo dual-mode 읽기 비교
const config = require('../config');
const emailAccountsRepo = require('../src/repo/emailAccountsRepo');

async function snap(mode) {
  config.USE_SUPABASE = mode === 'supabase';
  return emailAccountsRepo.list();
}

async function main() {
  const j = await snap('json');
  const d = await snap('supabase');

  console.log(`JSON: ${j.length}개, Supabase: ${d.length}개`);
  console.log('\n--- JSON[0] (비번 마스킹) ---');
  console.log({
    ...j[0],
    appPassword: j[0] && j[0].appPassword ? `***${j[0].appPassword.slice(-4)}` : '',
  });
  console.log('\n--- DB[0] (비번 마스킹) ---');
  console.log({
    ...d[0],
    appPassword: d[0] && d[0].appPassword ? `***${d[0].appPassword.slice(-4)}` : '',
  });

  // 서명 이미지 경로 비교 (JSON=로컬, DB=Storage URL 기대)
  console.log('\n--- 서명 이미지 ---');
  console.log('JSON:', j[0] && j[0].signatureImage);
  console.log('DB:  ', d[0] && d[0].signatureImage);

  const bothHaveSame = j.length === d.length
    && j.every((a, i) => a.email === d[i].email);
  console.log(bothHaveSame ? '\n[OK] 이메일 매핑 일치' : '\n[WARN] 차이');
}
main().catch(e => { console.error('[error]', e.message || e); process.exit(1); });
