// [요청] 제조사 관리 기능 — 제조사 추가 → 제품 추가 흐름 (dual-mode repo)
//   list() 반환 구조: { id, name, contactPerson, contact, hurdle, schedule, memo, status, productCount, createdAt }
//   - status: '' = 진행 / '협업종료'. 협업종료 시 연결된 제품 status도 함께 '협업종료'(endCollaboration 캐스케이드).
//   - productCount: 해당 제조사에 연결된 제품 수(삭제 경고/목록 표시용).
const fs = require('fs');
const config = require('../../config');
const { supabase } = require('../db');
const productsRepo = require('./productsRepo');

const STATUS_ACTIVE = '';
const STATUS_ENDED = '협업종료';

function rowToManufacturer(r, productCount = 0) {
  return {
    id: r.id,
    name: r.name || '',
    contactPerson: r.contact_person || '',
    contact: r.contact || '',
    hurdle: r.hurdle || '',
    schedule: r.schedule || '',
    memo: r.memo || '',
    status: r.status || '',
    productCount,
    createdAt: r.created_at || null,
  };
}

function normalizeIncoming(payload) {
  const row = {
    name: (payload.name || '').toString().trim(),
    contact_person: (payload.contactPerson || '').toString().trim() || null,
    contact: (payload.contact || '').toString().trim() || null,
    hurdle: (payload.hurdle || '').toString().trim() || null,
    schedule: (payload.schedule || '').toString().trim() || null,
    memo: (payload.memo || '').toString().trim() || null,
  };
  return row;
}

function requireName(row) {
  if (!row.name) { const e = new Error('NAME_REQUIRED'); e.code = 'NAME_REQUIRED'; throw e; }
}

// ─── JSON 구현 ───
function jsonLoadRaw() {
  try {
    const raw = fs.readFileSync(config.PATHS.manufacturers, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.manufacturers) ? parsed : { manufacturers: [] };
  } catch {
    return { manufacturers: [] };
  }
}
function jsonSave(manufacturers) {
  fs.writeFileSync(
    config.PATHS.manufacturers,
    JSON.stringify({ manufacturers }, null, 2),
    'utf-8'
  );
}

// 제품 목록을 productsRepo로 읽어 제조사별 연결 제품 수 집계(JSON/Supabase 공통).
async function countByManufacturer() {
  const products = await productsRepo.list();
  const counts = {};
  for (const p of products) {
    if (p.manufacturerId != null) {
      counts[p.manufacturerId] = (counts[p.manufacturerId] || 0) + 1;
    }
  }
  return counts;
}

async function listJson() {
  const list = jsonLoadRaw().manufacturers || [];
  const counts = await countByManufacturer();
  return list.slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map(r => rowToManufacturer(r, counts[r.id] || 0));
}

async function insertOneJson(payload) {
  const raw = jsonLoadRaw();
  const list = raw.manufacturers || [];
  const row = normalizeIncoming(payload);
  requireName(row);
  if (list.some(m => (m.name || '') === row.name)) {
    const e = new Error('DUPLICATE_NAME'); e.code = 'DUPLICATE_NAME'; throw e;
  }
  const nextId = list.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
  const newRow = { id: nextId, ...row, status: STATUS_ACTIVE, created_at: new Date().toISOString() };
  list.push(newRow);
  raw.manufacturers = list;
  jsonSave(list);
  return rowToManufacturer(newRow, 0);
}

async function updateOneJson(id, payload) {
  const raw = jsonLoadRaw();
  const list = raw.manufacturers || [];
  const numId = Number(id);
  const idx = list.findIndex(m => m.id === numId);
  if (idx === -1) { const e = new Error('NOT_FOUND'); e.code = 'NOT_FOUND'; throw e; }
  const row = normalizeIncoming(payload);
  requireName(row);
  if (list.some((m, j) => j !== idx && (m.name || '') === row.name)) {
    const e = new Error('DUPLICATE_NAME'); e.code = 'DUPLICATE_NAME'; throw e;
  }
  list[idx] = { ...list[idx], ...row };
  raw.manufacturers = list;
  jsonSave(list);
  return rowToManufacturer(list[idx]);
}

async function setStatusJson(id, status) {
  const raw = jsonLoadRaw();
  const list = raw.manufacturers || [];
  const numId = Number(id);
  const idx = list.findIndex(m => m.id === numId);
  if (idx === -1) { const e = new Error('NOT_FOUND'); e.code = 'NOT_FOUND'; throw e; }
  list[idx].status = status;
  raw.manufacturers = list;
  jsonSave(list);
  return rowToManufacturer(list[idx]);
}

async function removeOneJson(id) {
  const raw = jsonLoadRaw();
  const list = raw.manufacturers || [];
  const numId = Number(id);
  const idx = list.findIndex(m => m.id === numId);
  if (idx === -1) return;
  list.splice(idx, 1);
  raw.manufacturers = list;
  jsonSave(list);
}

// ─── Supabase 구현 ───
async function listSupabase() {
  const { data, error } = await supabase
    .from('manufacturers')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  const counts = await countByManufacturer();
  return (data || []).map(r => rowToManufacturer(r, counts[r.id] || 0));
}

async function insertOneSupabase(payload) {
  const row = normalizeIncoming(payload);
  requireName(row);
  const { data, error } = await supabase
    .from('manufacturers').insert({ ...row, status: STATUS_ACTIVE }).select().single();
  if (error) {
    if (error.code === '23505') { const e = new Error('DUPLICATE_NAME'); e.code = 'DUPLICATE_NAME'; throw e; }
    throw error;
  }
  return rowToManufacturer(data, 0);
}

async function updateOneSupabase(id, payload) {
  const row = normalizeIncoming(payload);
  requireName(row);
  const { data, error } = await supabase
    .from('manufacturers').update(row).eq('id', Number(id)).select().single();
  if (error) {
    if (error.code === '23505') { const e = new Error('DUPLICATE_NAME'); e.code = 'DUPLICATE_NAME'; throw e; }
    if (error.code === 'PGRST116') { const e = new Error('NOT_FOUND'); e.code = 'NOT_FOUND'; throw e; }
    throw error;
  }
  return rowToManufacturer(data);
}

async function setStatusSupabase(id, status) {
  const { data, error } = await supabase
    .from('manufacturers').update({ status }).eq('id', Number(id)).select().single();
  if (error) {
    if (error.code === 'PGRST116') { const e = new Error('NOT_FOUND'); e.code = 'NOT_FOUND'; throw e; }
    throw error;
  }
  return rowToManufacturer(data);
}

async function removeOneSupabase(id) {
  // [요청] 연결 제품은 공용 removeOne에서 먼저 삭제됨(removeByManufacturer). 여기선 제조사만 삭제.
  const { error } = await supabase.from('manufacturers').delete().eq('id', Number(id));
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
// [요청] 제조사 삭제 시 연결 제품도 함께 삭제 — 제품 먼저 삭제 후 제조사 삭제.
async function removeOne(id) {
  await productsRepo.removeByManufacturer(Number(id));
  return config.USE_SUPABASE ? removeOneSupabase(id) : removeOneJson(id);
}

// [요청] 제조사 협업종료 — 제조사 status 세팅 + 연결 제품 캐스케이드.
//   '협업종료'면 연결된 제품 status도 함께 '협업종료'로.
//   진행('')으로 복귀할 때는 제조사만 되돌리고 제품은 건드리지 않음(사용자가 개별 복귀).
async function endCollaboration(id) {
  const m = config.USE_SUPABASE ? await setStatusSupabase(id, STATUS_ENDED) : await setStatusJson(id, STATUS_ENDED);
  await productsRepo.setStatusByManufacturer(Number(id), STATUS_ENDED);
  return m;
}
async function reopen(id) {
  return config.USE_SUPABASE ? setStatusSupabase(id, STATUS_ACTIVE) : setStatusJson(id, STATUS_ACTIVE);
}

module.exports = {
  list, insertOne, updateOne, removeOne, endCollaboration, reopen,
  STATUS_ACTIVE, STATUS_ENDED,
};
