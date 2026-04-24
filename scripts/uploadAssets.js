// [요청] Supabase 메인 DB 이전 — 로컬 assets/ 이미지를 Storage로 업로드.
// - products.photos[] 참조는 product-photos 버킷으로
// - emailAccounts.signatureImage 참조는 signatures 버킷으로
// - 참조 안 되는 orphan 파일도 백업 차원에서 product-photos 버킷에 업로드
// - 결과: { 원본로컬경로: public URL } 매핑을 scripts/asset-url-map.json 저장
//   (4단계 데이터 이관 스크립트가 이 매핑을 참조)
// - 재실행 안전 (upsert: true)
const fs = require('fs');
const path = require('path');
const { supabase } = require('../src/db');

const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');
const OUTPUT_MAP = path.resolve(__dirname, 'asset-url-map.json');
const PRODUCTS_JSON = path.resolve(__dirname, '..', 'products.json');
const EMAIL_ACCOUNTS_JSON = path.resolve(__dirname, '..', 'emailAccounts.json');

function contentTypeFor(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'application/octet-stream';
}

async function uploadOne(bucket, filename, localPath) {
  const buf = fs.readFileSync(localPath);
  const { error } = await supabase.storage
    .from(bucket)
    .upload(filename, buf, { contentType: contentTypeFor(filename), upsert: true });
  if (error) throw new Error(`${bucket}/${filename}: ${error.message}`);
  const { data } = supabase.storage.from(bucket).getPublicUrl(filename);
  return data.publicUrl;
}

function collectReferences() {
  const products = JSON.parse(fs.readFileSync(PRODUCTS_JSON, 'utf-8'));
  const emailAccounts = JSON.parse(fs.readFileSync(EMAIL_ACCOUNTS_JSON, 'utf-8'));
  const refs = [];
  for (const p of products.products || []) {
    for (const photoPath of p.photos || []) {
      refs.push({ originalPath: photoPath, basename: path.basename(photoPath), usage: 'product' });
    }
  }
  for (const a of emailAccounts) {
    if (a.signatureImage) {
      refs.push({ originalPath: a.signatureImage, basename: path.basename(a.signatureImage), usage: 'signature' });
    }
  }
  return refs;
}

async function main() {
  const refs = collectReferences();
  const localFiles = new Set(fs.readdirSync(ASSETS_DIR));

  const urlMap = {};
  const missing = [];
  const uploadedProduct = new Set();
  const uploadedSignature = new Set();

  for (const ref of refs) {
    if (!localFiles.has(ref.basename)) {
      missing.push(ref);
      continue;
    }
    const bucket = ref.usage === 'signature' ? 'signatures' : 'product-photos';
    const set = ref.usage === 'signature' ? uploadedSignature : uploadedProduct;
    const localPath = path.join(ASSETS_DIR, ref.basename);
    if (!set.has(ref.basename)) {
      const url = await uploadOne(bucket, ref.basename, localPath);
      set.add(ref.basename);
      console.log(`[up] ${bucket}/${ref.basename}`);
      urlMap[ref.originalPath] = url;
    } else {
      const { data } = supabase.storage.from(bucket).getPublicUrl(ref.basename);
      urlMap[ref.originalPath] = data.publicUrl;
    }
  }

  // orphan: 참조 안 되지만 로컬에 있는 파일은 product-photos로 보존 업로드
  for (const filename of localFiles) {
    if (uploadedProduct.has(filename) || uploadedSignature.has(filename)) continue;
    const localPath = path.join(ASSETS_DIR, filename);
    if (!fs.statSync(localPath).isFile()) continue;
    await uploadOne('product-photos', filename, localPath);
    uploadedProduct.add(filename);
    console.log(`[up] product-photos/${filename} (orphan)`);
  }

  fs.writeFileSync(OUTPUT_MAP, JSON.stringify(urlMap, null, 2), 'utf-8');

  console.log('\n=== 완료 ===');
  console.log(`product-photos: ${uploadedProduct.size}개`);
  console.log(`signatures:     ${uploadedSignature.size}개`);
  console.log(`매핑 파일:       ${OUTPUT_MAP} (${Object.keys(urlMap).length}개 원본 경로)`);
  if (missing.length) {
    console.warn('\n[경고] 로컬 assets/에 없어 업로드 불가 (basename 기준):');
    for (const m of missing) console.warn(`  - ${m.originalPath}`);
    console.warn('  → 4단계 이관 시 해당 항목은 사진 없이 들어갑니다.');
  }
}

main().catch(e => { console.error('[error]', e.message || e); process.exit(1); });
