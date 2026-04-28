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
  return jsonLoadRaw().products || [];
}

async function replaceAllJson(products) {
  jsonSave(products);
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
      'product_photos(url, sort_order)'
    )
    .order('id');
  if (error) throw error;

  return data.map(p => ({
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

module.exports = { list, replaceAll, getByName, uploadPhoto };
