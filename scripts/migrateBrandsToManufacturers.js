// [요청] 제조사 관리 기능 — 기존 제품 brand_name → 제조사 자동 생성 + 연결 마이그레이션
//
// 동작:
//   1) products의 distinct brand_name(비어있지 않은) 목록을 만들고, 아직 없는 제조사를 manufacturers에 생성(멱등).
//   2) manufacturer_id가 비어있는 각 제품을 brand_name == manufacturers.name 으로 매칭해 연결.
//
// 사용법:
//   node scripts/migrateBrandsToManufacturers.js           # dry-run(변경 없이 계획만 출력)
//   node scripts/migrateBrandsToManufacturers.js --force    # 실제 반영
//
// dual-mode: config.USE_SUPABASE 에 따라 Supabase / JSON 자동 분기.
// ⚠️ Supabase 모드는 먼저 scripts/schema.sql 의 12번 블록(manufacturers + products.manufacturer_id/status)을 1회 실행해야 함.

const fs = require('fs');
const config = require('../config');
const productsRepo = require('../src/repo/productsRepo');
const manufacturersRepo = require('../src/repo/manufacturersRepo');

const FORCE = process.argv.includes('--force');

function log(...args) { console.log(...args); }

async function main() {
  log(`[마이그레이션] 모드: ${config.USE_SUPABASE ? 'Supabase' : 'JSON'} / ${FORCE ? '실제 반영(--force)' : 'DRY-RUN'}`);

  const products = await productsRepo.list();
  log(`제품 ${products.length}건 로드.`);

  // 1) distinct brand_name (비어있지 않은) 수집
  const brandNames = [];
  const seen = new Set();
  for (const p of products) {
    const b = String(p.brandName || '').trim();
    if (b && !seen.has(b)) { seen.add(b); brandNames.push(b); }
  }
  log(`고유 브랜드명 ${brandNames.length}종 발견.`);

  // 기존 제조사
  let existing = await manufacturersRepo.list();
  const existingNames = new Set(existing.map(m => m.name));

  const toCreate = brandNames.filter(b => !existingNames.has(b));
  log(`신규 생성 대상 제조사 ${toCreate.length}종: ${toCreate.join(', ') || '(없음)'}`);

  if (FORCE) {
    for (const name of toCreate) {
      try {
        await manufacturersRepo.insertOne({ name });
        log(`  + 제조사 생성: ${name}`);
      } catch (e) {
        if (e.code === 'DUPLICATE_NAME') log(`  = 이미 존재(skip): ${name}`);
        else throw e;
      }
    }
    existing = await manufacturersRepo.list();
  }

  // name → id 매핑
  const nameToId = Object.fromEntries(existing.map(m => [m.name, m.id]));

  // 2) manufacturer_id 비어있는 제품 연결
  const links = [];
  for (const p of products) {
    if (p.manufacturerId != null) continue;
    const b = String(p.brandName || '').trim();
    if (!b) continue;
    const mid = nameToId[b];
    if (mid != null) links.push({ product: p, manufacturerId: mid });
  }
  log(`연결 대상 제품 ${links.length}건 (manufacturer_id 비어있고 브랜드 매칭됨).`);

  if (!FORCE) {
    links.slice(0, 20).forEach(l => log(`  · ${l.product.name} (브랜드 ${l.product.brandName}) → 제조사#${l.manufacturerId}`));
    if (links.length > 20) log(`  ... 외 ${links.length - 20}건`);
    log('\nDRY-RUN 종료. 실제 반영하려면 --force 를 붙여 다시 실행하세요.');
    return;
  }

  if (config.USE_SUPABASE) {
    const { supabase } = require('../src/db');
    for (const l of links) {
      const { error } = await supabase
        .from('products').update({ manufacturer_id: l.manufacturerId }).eq('id', l.product.id);
      if (error) throw error;
      log(`  ✓ ${l.product.name} → 제조사#${l.manufacturerId}`);
    }
  } else {
    // JSON 모드: products.json 직접 갱신 (id = name)
    const raw = JSON.parse(fs.readFileSync(config.PATHS.products, 'utf-8'));
    const list = raw.products || [];
    const byId = new Map(links.map(l => [l.product.id, l.manufacturerId]));
    for (const p of list) {
      if (byId.has(p.name)) p.manufacturerId = byId.get(p.name);
    }
    fs.writeFileSync(config.PATHS.products, JSON.stringify({ products: list }, null, 2), 'utf-8');
    links.forEach(l => log(`  ✓ ${l.product.name} → 제조사#${l.manufacturerId}`));
  }

  log(`\n완료: 제조사 ${toCreate.length}종 생성, 제품 ${links.length}건 연결.`);
}

main().catch(e => { console.error('마이그레이션 실패:', e); process.exit(1); });
