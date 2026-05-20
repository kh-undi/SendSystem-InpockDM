// [요청] 추천 카탈로그 페이지 — 인플루언서별 큐레이션 공유 링크 (dual-mode repo)
// list() / getById(id) 반환 구조:
//   { id, code, title, influencerNickname, leadId, productIds, viewCount, viewedAt, createdAt }
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const config = require('../../config');
const { supabase } = require('../db');

const CATALOGS_JSON = path.resolve(__dirname, '..', '..', 'catalogs.json');

function generateCode() {
  // base64url 6글자 (≈ 36비트 엔트로피) — 충돌 확률 무시 가능
  return crypto.randomBytes(5).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    .slice(0, 6);
}

function rowToCatalog(r) {
  return {
    id: r.id,
    code: r.code,
    title: r.title || '',
    influencerNickname: r.influencer_nickname || '',
    leadId: r.lead_id || null,
    productIds: Array.isArray(r.product_ids) ? r.product_ids : (r.product_ids || []),
    viewCount: r.view_count || 0,
    viewedAt: r.viewed_at || null,
    createdAt: r.created_at || null,
  };
}

function normalizeIncoming(payload) {
  const productIds = Array.isArray(payload.productIds)
    ? payload.productIds.map(n => Number(n)).filter(n => Number.isInteger(n) && n > 0)
    : [];
  return {
    title: (payload.title || '').toString().trim() || null,
    influencer_nickname: (payload.influencerNickname || '').toString().trim(),
    lead_id: payload.leadId ? Number(payload.leadId) : null,
    product_ids: productIds,
  };
}

// ─── JSON 구현 ───
function jsonLoadRaw() {
  try {
    const raw = fs.readFileSync(CATALOGS_JSON, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.catalogs) ? parsed : { catalogs: [] };
  } catch {
    return { catalogs: [] };
  }
}
function jsonSave(catalogs) {
  fs.writeFileSync(CATALOGS_JSON, JSON.stringify({ catalogs }, null, 2), 'utf-8');
}

async function listJson() {
  const list = jsonLoadRaw().catalogs || [];
  return list.slice()
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .map(rowToCatalog);
}

async function insertOneJson(payload) {
  const raw = jsonLoadRaw();
  const list = raw.catalogs || [];
  const row = normalizeIncoming(payload);
  if (!row.influencer_nickname) {
    const e = new Error('NICKNAME_REQUIRED'); e.code = 'NICKNAME_REQUIRED'; throw e;
  }
  if (!row.product_ids.length) {
    const e = new Error('PRODUCTS_REQUIRED'); e.code = 'PRODUCTS_REQUIRED'; throw e;
  }
  let code;
  for (let i = 0; i < 5; i++) {
    code = generateCode();
    if (!list.some(c => c.code === code)) break;
  }
  const nextId = list.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
  const now = new Date().toISOString();
  const newRow = {
    id: nextId,
    code,
    ...row,
    view_count: 0,
    viewed_at: null,
    created_at: now,
  };
  list.unshift(newRow);
  raw.catalogs = list;
  jsonSave(list);
  return rowToCatalog(newRow);
}

// [요청] 기존 카탈로그 수정 — code/created_at/view_count/viewed_at 보존, 나머지 갱신
async function updateOneJson(id, payload) {
  const raw = jsonLoadRaw();
  const list = raw.catalogs || [];
  const numId = Number(id);
  const idx = list.findIndex(r => r.id === numId);
  if (idx === -1) { const e = new Error('NOT_FOUND'); e.code = 'NOT_FOUND'; throw e; }
  const row = normalizeIncoming(payload);
  if (!row.influencer_nickname) { const e = new Error('NICKNAME_REQUIRED'); e.code = 'NICKNAME_REQUIRED'; throw e; }
  if (!row.product_ids.length) { const e = new Error('PRODUCTS_REQUIRED'); e.code = 'PRODUCTS_REQUIRED'; throw e; }
  list[idx] = { ...list[idx], ...row };
  raw.catalogs = list;
  jsonSave(list);
  return rowToCatalog(list[idx]);
}

async function removeOneJson(id) {
  const raw = jsonLoadRaw();
  const list = raw.catalogs || [];
  const numId = Number(id);
  const idx = list.findIndex(r => r.id === numId);
  if (idx === -1) return;
  list.splice(idx, 1);
  raw.catalogs = list;
  jsonSave(list);
}

// ─── Supabase 구현 ───
async function listSupabase() {
  const { data, error } = await supabase
    .from('catalogs')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToCatalog);
}

async function insertOneSupabase(payload) {
  const row = normalizeIncoming(payload);
  if (!row.influencer_nickname) {
    const e = new Error('NICKNAME_REQUIRED'); e.code = 'NICKNAME_REQUIRED'; throw e;
  }
  if (!row.product_ids.length) {
    const e = new Error('PRODUCTS_REQUIRED'); e.code = 'PRODUCTS_REQUIRED'; throw e;
  }
  // 짧은 code라 안전을 위해 5회 재시도 (unique 충돌 시).
  let lastErr;
  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    const { data, error } = await supabase
      .from('catalogs')
      .insert({ ...row, code })
      .select()
      .single();
    if (!error) return rowToCatalog(data);
    if (error.code === '23505') { lastErr = error; continue; } // unique violation → retry
    throw error;
  }
  throw lastErr || new Error('CODE_GENERATION_FAILED');
}

// [요청] 기존 카탈로그 수정 — code/created_at/view_count/viewed_at 보존
async function updateOneSupabase(id, payload) {
  const numId = Number(id);
  const row = normalizeIncoming(payload);
  if (!row.influencer_nickname) { const e = new Error('NICKNAME_REQUIRED'); e.code = 'NICKNAME_REQUIRED'; throw e; }
  if (!row.product_ids.length) { const e = new Error('PRODUCTS_REQUIRED'); e.code = 'PRODUCTS_REQUIRED'; throw e; }
  const { data, error } = await supabase
    .from('catalogs')
    .update(row)
    .eq('id', numId)
    .select()
    .single();
  if (error) {
    if (error.code === 'PGRST116') { const e = new Error('NOT_FOUND'); e.code = 'NOT_FOUND'; throw e; }
    throw error;
  }
  return rowToCatalog(data);
}

async function removeOneSupabase(id) {
  const numId = Number(id);
  const { error } = await supabase.from('catalogs').delete().eq('id', numId);
  if (error) throw error;
}

// ─── 공용 API ───
async function list() {
  return config.USE_SUPABASE ? listSupabase() : listJson();
}
async function insertOne(payload) {
  return config.USE_SUPABASE ? insertOneSupabase(payload) : insertOneJson(payload);
}
async function updateOne(id, payload) {
  return config.USE_SUPABASE ? updateOneSupabase(id, payload) : updateOneJson(id, payload);
}
async function removeOne(id) {
  return config.USE_SUPABASE ? removeOneSupabase(id) : removeOneJson(id);
}

module.exports = { list, insertOne, updateOne, removeOne };
