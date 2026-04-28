// [요청] orphan 정리 — Storage(product-photos) ↔ DB(product_photos.url) 비교 후 미참조 파일 제거
//
// 사용법:
//   node scripts/cleanupOrphanPhotos.js              (dry-run, 출력만)
//   node scripts/cleanupOrphanPhotos.js --force      (실제 삭제)
//   node scripts/cleanupOrphanPhotos.js --grace 0    (grace period 0분, 모든 파일 검사)
//
// 동작:
// 1. Storage product-photos 버킷의 모든 파일 list (paginated)
// 2. DB product_photos.url에서 basename 추출 → Set
// 3. Storage 파일 중 Set에 없는 것 = orphan
// 4. 단, 최근 N분 이내에 만들어진 파일은 grace period로 제외 (기본 30분)
// 5. dry-run이면 출력만, --force면 실제 삭제
require('dotenv').config();
const config = require('../config');
const { supabase } = require('../src/db');

const BUCKET = 'product-photos';
const PAGE_SIZE = 100;

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { force: false, graceMinutes: 30 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--force') out.force = true;
    else if (args[i] === '--grace') {
      const n = parseInt(args[++i], 10);
      if (Number.isFinite(n) && n >= 0) out.graceMinutes = n;
    }
  }
  return out;
}

async function listAllStorageFiles() {
  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list('', { limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`[storage list] ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += data.length;
  }
  return all;
}

async function getReferencedBasenames() {
  const { data, error } = await supabase.from('product_photos').select('url');
  if (error) throw new Error(`[db product_photos] ${error.message}`);
  const set = new Set();
  for (const row of data || []) {
    if (!row.url) continue;
    // public URL의 마지막 segment를 파일명으로 간주
    const basename = row.url.split('/').pop().split('?')[0];
    if (basename) set.add(decodeURIComponent(basename));
  }
  return set;
}

async function main() {
  if (!config.USE_SUPABASE) {
    console.log('USE_SUPABASE=false 모드 — Storage가 사용되지 않으므로 정리할 대상 없음. 종료.');
    process.exit(0);
  }

  const { force, graceMinutes } = parseArgs();
  console.log(`[설정] mode=${force ? 'FORCE (실제 삭제)' : 'dry-run'}, grace=${graceMinutes}분`);
  console.log(`[설정] bucket=${BUCKET}\n`);

  // 1. DB 참조 조회 — 실패 시 즉시 중단 (Set 비어있으면 모든 파일이 orphan으로 잡혀 위험)
  let referenced;
  try {
    referenced = await getReferencedBasenames();
  } catch (e) {
    console.error('DB 참조 조회 실패. 안전을 위해 중단합니다.');
    console.error(e.message);
    process.exit(1);
  }
  console.log(`[DB] product_photos에서 참조된 파일 ${referenced.size}개`);

  // 2. Storage 전체 파일 list
  let storageFiles;
  try {
    storageFiles = await listAllStorageFiles();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  console.log(`[Storage] 버킷 내 파일 ${storageFiles.length}개`);

  // 3. orphan 식별
  const now = Date.now();
  const graceMs = graceMinutes * 60 * 1000;
  const orphans = [];
  let skippedByGrace = 0;
  for (const f of storageFiles) {
    if (referenced.has(f.name)) continue;
    const created = f.created_at ? new Date(f.created_at).getTime() : 0;
    if (graceMs > 0 && created && now - created < graceMs) {
      skippedByGrace++;
      continue;
    }
    orphans.push(f);
  }
  console.log(`[grace] 최근 ${graceMinutes}분 이내 파일 ${skippedByGrace}개 제외`);
  console.log(`[결과] orphan ${orphans.length}개\n`);

  if (orphans.length === 0) {
    console.log('정리할 파일 없음. 종료.');
    process.exit(0);
  }

  for (const f of orphans) {
    console.log(`  - ${f.name} (created: ${f.created_at || '?'})`);
  }

  if (!force) {
    console.log('\n[dry-run] 실제로 삭제하려면 --force 플래그를 추가하세요.');
    process.exit(0);
  }

  // 4. force 모드 — 5초 카운트다운 후 삭제
  console.log(`\n⚠️  ${orphans.length}개 파일을 삭제합니다. 5초 후 진행 (Ctrl+C로 취소)...`);
  for (let i = 5; i > 0; i--) {
    process.stdout.write(`\r  ${i}...   `);
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('\n');

  const names = orphans.map(f => f.name);
  // Supabase storage remove는 한 번에 여러 파일 가능
  const { error } = await supabase.storage.from(BUCKET).remove(names);
  if (error) {
    console.error('[삭제 실패]', error.message);
    process.exit(1);
  }
  console.log(`✅ ${names.length}개 파일 삭제 완료.`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
