// [요청] Supabase 메인 DB 이전 — 4단계 데이터 이관
// 실행: node scripts/migrateJsonToSupabase.js --force
// 기존 테이블 전체 삭제 후 JSON 파일들에서 재삽입 (멱등).
// asset-url-map.json (3단계 산출물)을 참조해 로컬 경로를 Supabase Storage URL로 치환.

const fs = require('fs');
const path = require('path');
const { supabase } = require('../src/db');

const ROOT = path.resolve(__dirname, '..');
const URL_MAP_PATH = path.resolve(__dirname, 'asset-url-map.json');

function die(msg) { console.error(msg); process.exit(1); }

function requireForce() {
  if (!process.argv.includes('--force')) {
    die('기존 테이블을 삭제·재삽입합니다. 확인 후 --force를 붙여 실행:\n  node scripts/migrateJsonToSupabase.js --force');
  }
}

function readJson(p, fallback = null) {
  if (!fs.existsSync(p)) return fallback;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch (e) { die(`JSON 파싱 실패: ${p} — ${e.message}`); }
}

async function deleteAll(table, notNullCol) {
  const { error } = await supabase.from(table).delete().not(notNullCol, 'is', null);
  if (error) throw new Error(`[clear ${table}] ${error.message}`);
}

async function clearAll() {
  // FK 순서: 자식 → 부모
  await deleteAll('sent_log', 'id');
  await deleteAll('weekly_tracking', 'account_id');
  await deleteAll('product_photos', 'id');
  await deleteAll('products', 'id');
  await deleteAll('email_accounts', 'id');
  await deleteAll('replies', 'id');
  await deleteAll('reply_runs', 'id');
  await deleteAll('influencers', 'id');
  await deleteAll('settings', 'key');
  await deleteAll('accounts', 'id');
  console.log('[clear] 기존 데이터 전체 삭제');
}

async function migrateAccounts() {
  const json = readJson(path.join(ROOT, 'accounts.json'), []);
  if (!json.length) return { idMap: {}, count: 0 };

  const rows = json.map(a => ({
    username: a.username,
    password: a.password,
    active: a.active !== false,
  }));
  const { data: inserted, error } = await supabase
    .from('accounts').insert(rows).select('id, username');
  if (error) throw new Error(`[accounts] ${error.message}`);

  const byUsername = Object.fromEntries(inserted.map(r => [r.username, r.id]));
  const idMap = {};
  for (const a of json) {
    if (byUsername[a.username] != null) idMap[a.id] = byUsername[a.username];
  }

  const wtRows = [];
  for (const a of json) {
    const dbId = byUsername[a.username];
    if (dbId == null) continue;
    for (const [week, cnt] of Object.entries(a.weeklyTracking || {})) {
      wtRows.push({ account_id: dbId, week_key: week, count: cnt });
    }
  }
  if (wtRows.length) {
    const { error: wtErr } = await supabase.from('weekly_tracking').insert(wtRows);
    if (wtErr) throw new Error(`[weekly_tracking] ${wtErr.message}`);
  }

  console.log(`[accounts] ${inserted.length}개, weekly_tracking ${wtRows.length}개 row`);
  return { idMap, count: inserted.length };
}

async function migrateEmailAccounts(urlMap) {
  const json = readJson(path.join(ROOT, 'emailAccounts.json'), []);
  if (!json.length) return 0;

  const rows = json.map(a => ({
    email: a.email,
    app_password: a.appPassword,
    sender_name: a.senderName,
    signature: a.signature || null,
    signature_image_url: a.signatureImage ? (urlMap[a.signatureImage] || null) : null,
    active: a.active !== false,
  }));
  const { error } = await supabase.from('email_accounts').insert(rows);
  if (error) throw new Error(`[email_accounts] ${error.message}`);
  console.log(`[email_accounts] ${rows.length}개`);
  return rows.length;
}

async function migrateProducts(urlMap) {
  const json = readJson(path.join(ROOT, 'products.json'), { products: [] });
  const list = json.products || [];
  if (!list.length) return 0;

  const productRows = list.map(p => ({
    name: p.name,
    brand_name: p.brandName || null,
    product_name: p.productName || null,
    campaign_type: p.campaignType || null,
    category: p.category || null,
    mail_subject: p.mailSubject || null,
    usp: p.usp || null,
    offer_message: p.offerMessage || null,
  }));
  const { data: inserted, error } = await supabase
    .from('products').insert(productRows).select('id, name');
  if (error) throw new Error(`[products] ${error.message}`);

  const byName = Object.fromEntries(inserted.map(r => [r.name, r.id]));

  const photoRows = [];
  for (const p of list) {
    const pid = byName[p.name];
    if (pid == null) continue;
    (p.photos || []).forEach((originalPath, i) => {
      const url = urlMap[originalPath];
      if (!url) {
        console.warn(`  [warn] URL 매핑 없음: ${originalPath} (product "${p.name}")`);
        return;
      }
      photoRows.push({ product_id: pid, url, sort_order: i });
    });
  }
  if (photoRows.length) {
    const { error: phErr } = await supabase.from('product_photos').insert(photoRows);
    if (phErr) throw new Error(`[product_photos] ${phErr.message}`);
  }

  console.log(`[products] ${inserted.length}개, product_photos ${photoRows.length}개 row`);
  return inserted.length;
}

async function migrateInfluencers() {
  const pending = readJson(path.join(ROOT, 'influencers.json'), []);
  const failed = readJson(path.join(ROOT, 'failed.json'), []);

  const rows = [];
  for (const inf of pending) {
    rows.push({
      nickname: inf.nickname,
      profile_url: inf.profileUrl,
      product_name: inf.productName,
      status: 'pending',
    });
  }
  for (const inf of failed) {
    rows.push({
      nickname: inf.nickname,
      profile_url: inf.profileUrl,
      product_name: inf.productName,
      status: 'failed',
      error: inf.error || null,
    });
  }
  if (!rows.length) return 0;

  const batchSize = 200;
  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('influencers').insert(batch);
    if (error) throw new Error(`[influencers] ${error.message}`);
    total += batch.length;
  }
  console.log(`[influencers] ${total}개 (pending ${pending.length}, failed ${failed.length})`);
  return total;
}

async function migrateReplies() {
  const json = readJson(path.join(ROOT, 'replies.json'), null);
  if (!json || !Array.isArray(json.results)) return 0;

  const runCheckedAt = json.checkedAt || new Date().toISOString();
  const { data: runRows, error: runErr } = await supabase
    .from('reply_runs')
    .insert({
      started_at: runCheckedAt,
      finished_at: json.partial === true ? null : runCheckedAt,
      note: 'JSON 이관',
    })
    .select('id');
  if (runErr) throw new Error(`[reply_runs] ${runErr.message}`);

  const runId = runRows[0].id;
  const rows = json.results.map(r => ({
    run_id: runId,
    account_username: r.account,
    reply_count: r.replyCount || 0,
    error: r.error || null,
    checked_at: runCheckedAt,
  }));
  if (rows.length) {
    const { error } = await supabase.from('replies').insert(rows);
    if (error) throw new Error(`[replies] ${error.message}`);
  }
  console.log(`[replies] 1 run, ${rows.length}개 결과`);
  return rows.length;
}

async function migrateSettings() {
  const json = readJson(path.join(ROOT, 'settings.json'), null);
  if (!json || typeof json !== 'object') return 0;
  const rows = Object.entries(json).map(([k, v]) => ({ key: k, value: v }));
  if (!rows.length) return 0;
  const { error } = await supabase.from('settings').insert(rows);
  if (error) throw new Error(`[settings] ${error.message}`);
  console.log(`[settings] ${rows.length}개 키`);
  return rows.length;
}

async function migrateSentLog(accountIdMap) {
  const logPath = path.join(ROOT, 'logs', 'sent.log');
  if (!fs.existsSync(logPath)) {
    console.log('[sent_log] 파일 없음, 건너뜀');
    return 0;
  }
  const lines = fs.readFileSync(logPath, 'utf-8').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return 0;

  const rows = [];
  for (const line of lines) {
    // CSV: timestamp,accountId,nickname,profileUrl,productName
    // 마지막 productName에 쉼표 섞일 수 있어 5번째부터 끝까지 join
    const parts = line.split(',');
    if (parts.length < 5) continue;
    const ts = parts[0];
    const accId = parts[1];
    const nick = parts[2];
    const url = parts[3];
    const productName = parts.slice(4).join(',');
    const jsonAccountId = parseInt(accId, 10);
    const dbAccountId = accountIdMap[jsonAccountId] != null ? accountIdMap[jsonAccountId] : null;
    rows.push({
      account_id: dbAccountId,
      nickname: nick || null,
      profile_url: url || null,
      product_name: productName || null,
      sent_at: ts || null,
    });
  }
  if (!rows.length) return 0;

  const batchSize = 500;
  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('sent_log').insert(batch);
    if (error) throw new Error(`[sent_log] ${error.message}`);
    total += batch.length;
  }
  console.log(`[sent_log] ${total}개`);
  return total;
}

async function main() {
  requireForce();

  const urlMap = readJson(URL_MAP_PATH, {});
  if (!Object.keys(urlMap).length) {
    console.warn('[warn] asset-url-map.json 없음/빈 객체 — 먼저 uploadAssets.js 실행 권장.');
  }

  await clearAll();
  const { idMap: accountIdMap } = await migrateAccounts();
  await migrateEmailAccounts(urlMap);
  await migrateProducts(urlMap);
  await migrateInfluencers();
  await migrateReplies();
  await migrateSettings();
  await migrateSentLog(accountIdMap);

  console.log('\n=== 이관 완료 ===');
}

main().catch(e => { console.error('[error]', e.message || e); process.exit(1); });
