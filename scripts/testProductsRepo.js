// [요청] Supabase 메인 DB 이전 — productsRepo dual-mode 읽기 비교 테스트
const config = require('../config');
const productsRepo = require('../src/repo/productsRepo');

async function snapshot(mode) {
  config.USE_SUPABASE = mode === 'supabase';
  return productsRepo.list();
}

async function main() {
  const jsonList = await snapshot('json');
  const dbList = await snapshot('supabase');

  console.log(`JSON:     ${jsonList.length}개 product`);
  console.log(`Supabase: ${dbList.length}개 product`);

  const jsonNames = new Set(jsonList.map(p => p.name));
  const dbNames = new Set(dbList.map(p => p.name));
  const onlyJson = [...jsonNames].filter(n => !dbNames.has(n));
  const onlyDb = [...dbNames].filter(n => !jsonNames.has(n));
  console.log('JSON에만:', onlyJson);
  console.log('DB에만:', onlyDb);

  // 첫 번째 product 상세 비교
  console.log('\n--- JSON[0] ---');
  console.log(JSON.stringify(jsonList[0], null, 2).slice(0, 500));
  console.log('\n--- DB[0] (같은 name) ---');
  const dbMatch = dbList.find(p => p.name === jsonList[0].name);
  console.log(JSON.stringify(dbMatch, null, 2).slice(0, 500));

  // 사진 URL 차이 확인
  console.log('\n--- 사진 경로 비교 ---');
  console.log('JSON:', jsonList[0].photos);
  console.log('DB:  ', dbMatch ? dbMatch.photos : '(없음)');

  // 구조 필드 체크
  const requiredFields = ['name', 'brandName', 'productName', 'campaignType', 'category', 'usp', 'offerMessage', 'photos'];
  const missingInDb = requiredFields.filter(f => dbMatch && !(f in dbMatch));
  console.log('\nDB 모드에서 누락된 필드:', missingInDb);

  if (!onlyJson.length && !onlyDb.length && !missingInDb.length) {
    console.log('\n[OK] 양쪽 모드 동일한 product 집합, 필수 필드 모두 존재');
  } else {
    console.log('\n[WARN] 차이 있음');
  }
}

main().catch(e => { console.error('[error]', e.message || e); process.exit(1); });
