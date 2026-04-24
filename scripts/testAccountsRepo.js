// [요청] Supabase 메인 DB 이전 — accountsRepo dual-mode 읽기 비교 테스트
// USE_SUPABASE 플래그를 프로세스 내에서 직접 바꿔가며 두 모드 결과를 비교한다.
// 쓰기/카운터 변경 없이 읽기만 수행 → 안전하게 반복 실행 가능.

const config = require('../config');
const accountsRepo = require('../src/repo/accountsRepo');

async function snapshot(mode) {
  config.USE_SUPABASE = mode === 'supabase';
  // repo 내부에서는 매 호출마다 config.USE_SUPABASE를 다시 읽으므로 안전
  const list = await accountsRepo.list();
  return list.map(a => ({
    id: a.id,
    username: a.username,
    weeklyTracking: a.weeklyTracking,
  }));
}

function summarize(list) {
  const totalWeekRows = list.reduce(
    (sum, a) => sum + Object.keys(a.weeklyTracking || {}).length, 0);
  return {
    count: list.length,
    totalWeekRows,
    ids: list.map(a => a.id).join(','),
  };
}

async function main() {
  console.log('=== JSON 모드 ===');
  const jsonList = await snapshot('json');
  console.log(summarize(jsonList));

  console.log('\n=== Supabase 모드 ===');
  const dbList = await snapshot('supabase');
  console.log(summarize(dbList));

  // 세부 비교: 첫 2건 출력
  console.log('\n--- 첫 2건 상세 비교 ---');
  for (let i = 0; i < Math.min(2, jsonList.length, dbList.length); i++) {
    console.log(`JSON[${i}]:`, JSON.stringify(jsonList[i]));
    console.log(`DB  [${i}]:`, JSON.stringify(dbList[i]));
  }

  // 동일성 체크 (username 기준)
  const jsonUsers = new Set(jsonList.map(a => a.username));
  const dbUsers = new Set(dbList.map(a => a.username));
  const onlyInJson = [...jsonUsers].filter(u => !dbUsers.has(u));
  const onlyInDb = [...dbUsers].filter(u => !jsonUsers.has(u));
  console.log('\n--- username 차집합 ---');
  console.log('JSON에만:', onlyInJson);
  console.log('DB에만:', onlyInDb);

  if (!onlyInJson.length && !onlyInDb.length) {
    console.log('\n[OK] 양쪽 mode 모두 동일한 username 집합 반환');
  } else {
    console.log('\n[WARN] 차이 있음 — 확인 필요');
  }
}

main().catch(e => { console.error('[error]', e.message || e); process.exit(1); });
