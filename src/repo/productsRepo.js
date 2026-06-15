// [요청] Supabase 메인 DB 이전 — products repo (dual-mode)
// list() 반환 구조는 기존 JSON과 동일: { name, brandName, productName, ..., photos: [...urls] }
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { supabase } = require('../db');

// ─── JSON 구현 ───
function jsonLoadRaw() {
  const raw = fs.readFileSync(config.PATHS.products, 'utf-8');
  return JSON.parse(raw);
}
function jsonSave(products) {
  fs.writeFileSync(
    config.PATHS.products,
    JSON.stringify({ products }, null, 2),
    'utf-8'
  );
}

async function listJson() {
  // [요청] 카드 단위 저장 — JSON 모드는 unique한 name을 id로 부여(클라가 id 보유 → 단건 update/delete 라우팅 가능)
  const list = jsonLoadRaw().products || [];
  return list.map(p => ({ ...p, id: p.name }));
}

async function replaceAllJson(products) {
  jsonSave(products);
}

// [요청] 빠른 제품 추가 — JSON 모드 단건 insert. unique 위반은 'DUPLICATE_NAME' throw.
async function insertOneJson(product) {
  const raw = jsonLoadRaw();
  const list = raw.products || [];
  if (list.some(p => p.name === product.name)) {
    const err = new Error('DUPLICATE_NAME');
    err.code = 'DUPLICATE_NAME';
    throw err;
  }
  list.unshift(product);
  raw.products = list;
  fs.writeFileSync(config.PATHS.products, JSON.stringify(raw, null, 2), 'utf-8');
  // [요청] 카드 단위 저장 — id(=name) 포함해 반환
  return { ...product, id: product.name };
}

// [요청] 카드 단위 저장 — JSON 단건 update. id는 (변경 전) name과 일치하는 row 찾아 in-place 교체.
async function updateOneJson(id, product) {
  const raw = jsonLoadRaw();
  const list = raw.products || [];
  const idx = list.findIndex(p => p.name === id);
  if (idx === -1) {
    const e = new Error('NOT_FOUND');
    e.code = 'NOT_FOUND';
    throw e;
  }
  // 이름이 바뀌었는데 다른 row의 이름과 충돌하면 거부
  if (product.name !== id && list.some((p, j) => j !== idx && p.name === product.name)) {
    const e = new Error('DUPLICATE_NAME');
    e.code = 'DUPLICATE_NAME';
    throw e;
  }
  list[idx] = product;
  raw.products = list;
  fs.writeFileSync(config.PATHS.products, JSON.stringify(raw, null, 2), 'utf-8');
  return { ...product, id: product.name };
}

// [요청] 카드 단위 저장 — JSON 단건 삭제. 없으면 idempotent.
async function removeOneJson(id) {
  const raw = jsonLoadRaw();
  const list = raw.products || [];
  const idx = list.findIndex(p => p.name === id);
  if (idx === -1) return;
  list.splice(idx, 1);
  raw.products = list;
  fs.writeFileSync(config.PATHS.products, JSON.stringify(raw, null, 2), 'utf-8');
}

async function uploadPhotoJson(localPath) {
  // multer가 이미 assets/에 저장. 경로만 forward slash로 정규화해 반환.
  return localPath.replace(/\\/g, '/');
}

// ─── Supabase 구현 ───
async function listSupabase() {
  // [요청] 제품 목록 필드 확장 — hooking_phrases ~ age_range select·매핑 추가
  const { data, error } = await supabase
    .from('products')
    .select(
      'id, name, brand_name, product_name, campaign_type, category, ' +
      'mail_subject, usp, offer_message, ' +
      'hooking_phrases, product_link, announce_example_link, announce_example_owner, ' +
      'hurdle, schedule, memo, age_range, ' +
      // [요청] 제조사 관리 — 제조사 FK + 협업종료 status
      'manufacturer_id, status, ' +
      'product_photos(url, sort_order)'
    )
    // [요청] 빠른 제품 추가 — 신규 row가 위로 오도록 created_at DESC. 같은 batch(replaceAll)는 created_at 동일 → id ASC로 메모리 순서 보존.
    .order('created_at', { ascending: false })
    .order('id', { ascending: true });
  if (error) throw error;

  return data.map(p => ({
    id: p.id, // [요청] 카드 단위 저장 — 클라가 단건 PUT/DELETE 라우팅에 사용
    name: p.name,
    brandName: p.brand_name || '',
    productName: p.product_name || '',
    campaignType: p.campaign_type || '',
    category: p.category || '',
    mailSubject: p.mail_subject || '',
    usp: p.usp || '',
    offerMessage: p.offer_message || '',
    hookingPhrases: Array.isArray(p.hooking_phrases) ? p.hooking_phrases : [],
    productLink: p.product_link || '',
    announceExampleLink: p.announce_example_link || '',
    announceExampleOwner: p.announce_example_owner || '',
    hurdle: p.hurdle || '',
    schedule: p.schedule || '',
    memo: p.memo || '',
    ageRange: p.age_range || '',
    // [요청] 제조사 관리 — 제조사 FK + 협업종료 status
    manufacturerId: p.manufacturer_id ?? null,
    status: p.status || '',
    photos: (p.product_photos || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(ph => ph.url),
  }));
}

async function replaceAllSupabase(products) {
  // 전체 삭제 후 재삽입. product_photos는 FK cascade로 함께 삭제됨.
  const { error: delErr } = await supabase
    .from('products').delete().not('id', 'is', null);
  if (delErr) throw delErr;

  if (!products || !products.length) return;

  // [요청] 제품 목록 필드 확장 — insert 매핑에 신규 컬럼 7종 추가
  const productRows = products.map(p => ({
    name: p.name,
    brand_name: p.brandName || null,
    product_name: p.productName || null,
    campaign_type: p.campaignType || null,
    category: p.category || null,
    mail_subject: p.mailSubject || null,
    usp: p.usp || null,
    offer_message: p.offerMessage || null,
    hooking_phrases: Array.isArray(p.hookingPhrases) ? p.hookingPhrases : [],
    product_link: p.productLink || null,
    announce_example_link: p.announceExampleLink || null,
    announce_example_owner: p.announceExampleOwner || null,
    hurdle: p.hurdle || null,
    schedule: p.schedule || null,
    memo: p.memo || null,
    age_range: p.ageRange || null,
    // [요청] 제조사 관리 — 제조사 FK + 협업종료 status
    manufacturer_id: p.manufacturerId ?? null,
    status: p.status || '',
  }));
  const { data: inserted, error } = await supabase
    .from('products').insert(productRows).select('id, name');
  if (error) throw error;

  const byName = Object.fromEntries(inserted.map(r => [r.name, r.id]));
  const photoRows = [];
  for (const p of products) {
    const pid = byName[p.name];
    if (pid == null) continue;
    (p.photos || []).forEach((url, i) => {
      if (url) photoRows.push({ product_id: pid, url, sort_order: i });
    });
  }
  if (photoRows.length) {
    const { error: phErr } = await supabase.from('product_photos').insert(photoRows);
    if (phErr) throw phErr;
  }
}

// products → DB row 매핑(공통)
function toRow(product) {
  return {
    name: product.name,
    brand_name: product.brandName || null,
    product_name: product.productName || null,
    campaign_type: product.campaignType || null,
    category: product.category || null,
    mail_subject: product.mailSubject || null,
    usp: product.usp || null,
    offer_message: product.offerMessage || null,
    hooking_phrases: Array.isArray(product.hookingPhrases) ? product.hookingPhrases : [],
    product_link: product.productLink || null,
    announce_example_link: product.announceExampleLink || null,
    announce_example_owner: product.announceExampleOwner || null,
    hurdle: product.hurdle || null,
    schedule: product.schedule || null,
    memo: product.memo || null,
    age_range: product.ageRange || null,
    // [요청] 제조사 관리 — 제조사 FK + 협업종료 status
    manufacturer_id: product.manufacturerId ?? null,
    status: product.status || '',
  };
}

// product_photos 동기화: 기존 row 전부 삭제 후 photos 배열로 재삽입.
async function replacePhotosSupabase(productId, photos) {
  const { error: delErr } = await supabase
    .from('product_photos').delete().eq('product_id', productId);
  if (delErr) throw delErr;
  if (!photos || !photos.length) return;
  const rows = photos.filter(Boolean).map((url, i) => ({ product_id: productId, url, sort_order: i }));
  if (!rows.length) return;
  const { error: insErr } = await supabase.from('product_photos').insert(rows);
  if (insErr) throw insErr;
}

// [요청] 빠른 제품 추가 — Supabase 단건 insert. unique 위반(23505)은 'DUPLICATE_NAME' throw.
// [요청] 카드 단위 저장 — photos 배열 있으면 product_photos에도 함께 insert.
async function insertOneSupabase(product) {
  const { data, error } = await supabase
    .from('products').insert(toRow(product)).select().single();
  if (error) {
    if (error.code === '23505') {
      const e = new Error('DUPLICATE_NAME');
      e.code = 'DUPLICATE_NAME';
      throw e;
    }
    throw error;
  }
  if (Array.isArray(product.photos) && product.photos.length) {
    await replacePhotosSupabase(data.id, product.photos);
  }
  return data;
}

// [요청] 카드 단위 저장 — Supabase 단건 update. products UPDATE + product_photos 통째 교체.
async function updateOneSupabase(id, product) {
  const numId = Number(id);
  const { data, error } = await supabase
    .from('products').update(toRow(product)).eq('id', numId).select().single();
  if (error) {
    if (error.code === '23505') {
      const e = new Error('DUPLICATE_NAME');
      e.code = 'DUPLICATE_NAME';
      throw e;
    }
    if (error.code === 'PGRST116') {
      const e = new Error('NOT_FOUND');
      e.code = 'NOT_FOUND';
      throw e;
    }
    throw error;
  }
  await replacePhotosSupabase(numId, product.photos || []);
  return data;
}

// [요청] 카드 단위 저장 — Supabase 단건 삭제. product_photos는 FK cascade.
async function removeOneSupabase(id) {
  const numId = Number(id);
  const { error } = await supabase.from('products').delete().eq('id', numId);
  if (error) throw error;
}

function contentTypeFor(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

async function uploadPhotoSupabase(localPath) {
  // multer가 저장한 로컬 파일을 Storage에 업로드하고 public URL 반환.
  // 로컬 파일은 그대로 두어(롤백 대비) 저장 공간에 대한 문제는 8단계에서 정리.
  const filename = path.basename(localPath);
  const buf = fs.readFileSync(localPath);
  const { error } = await supabase.storage
    .from('product-photos')
    .upload(filename, buf, { contentType: contentTypeFor(filename), upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('product-photos').getPublicUrl(filename);
  return data.publicUrl;
}

// [요청] 제조사 관리 — 제조사 협업종료 시 연결 제품 캐스케이드.
//   status를 일괄 세팅(예: '협업종료'). opts.clearManufacturer면 status 대신 manufacturer_id를 null로(제조사 삭제 시 JSON 모드 정리용).
async function setStatusByManufacturerSupabase(manufacturerId, status, opts = {}) {
  const patch = opts.clearManufacturer ? { manufacturer_id: null } : { status };
  const { error } = await supabase
    .from('products').update(patch).eq('manufacturer_id', Number(manufacturerId));
  if (error) throw error;
}
async function setStatusByManufacturerJson(manufacturerId, status, opts = {}) {
  const raw = jsonLoadRaw();
  const list = raw.products || [];
  let changed = false;
  for (const p of list) {
    if (Number(p.manufacturerId) === Number(manufacturerId)) {
      if (opts.clearManufacturer) p.manufacturerId = null;
      else p.status = status;
      changed = true;
    }
  }
  if (changed) jsonSave(list);
}
async function setStatusByManufacturer(manufacturerId, status, opts = {}) {
  return config.USE_SUPABASE
    ? setStatusByManufacturerSupabase(manufacturerId, status, opts)
    : setStatusByManufacturerJson(manufacturerId, status, opts);
}

// [요청] 제조사 삭제 시 연결 제품도 함께 삭제 — 해당 manufacturer_id 제품 일괄 삭제.
async function removeByManufacturerSupabase(manufacturerId) {
  // product_photos는 products FK on delete cascade로 함께 삭제됨.
  const { error } = await supabase
    .from('products').delete().eq('manufacturer_id', Number(manufacturerId));
  if (error) throw error;
}
async function removeByManufacturerJson(manufacturerId) {
  const raw = jsonLoadRaw();
  const list = raw.products || [];
  const kept = list.filter(p => Number(p.manufacturerId) !== Number(manufacturerId));
  if (kept.length !== list.length) jsonSave(kept);
}
async function removeByManufacturer(manufacturerId) {
  return config.USE_SUPABASE
    ? removeByManufacturerSupabase(manufacturerId)
    : removeByManufacturerJson(manufacturerId);
}

// ─── 공용 API ───
async function list() {
  return config.USE_SUPABASE ? listSupabase() : listJson();
}

async function replaceAll(products) {
  return config.USE_SUPABASE ? replaceAllSupabase(products) : replaceAllJson(products);
}

async function getByName(name) {
  const all = await list();
  return all.find(p => p.name === name) || null;
}

async function uploadPhoto(localPath) {
  return config.USE_SUPABASE ? uploadPhotoSupabase(localPath) : uploadPhotoJson(localPath);
}

// [요청] 빠른 제품 추가
async function insertOne(product) {
  return config.USE_SUPABASE ? insertOneSupabase(product) : insertOneJson(product);
}

// [요청] 카드 단위 저장 — 단건 update / delete
async function updateOne(id, product) {
  return config.USE_SUPABASE ? updateOneSupabase(id, product) : updateOneJson(id, product);
}

async function removeOne(id) {
  return config.USE_SUPABASE ? removeOneSupabase(id) : removeOneJson(id);
}

module.exports = { list, replaceAll, getByName, uploadPhoto, insertOne, updateOne, removeOne, setStatusByManufacturer, removeByManufacturer };
