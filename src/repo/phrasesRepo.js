// [요청] 자주 사용하는 문구 — 직원별 추가/복사 탭 신설 (dual-mode repo)
//   phrases: 직원별 자주 쓰는 문구(메모). employee_id로 employees 참조.
//   list(employeeId?) / 반환 구조: { id, employeeId, title, content, sortOrder, createdAt }
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { supabase } = require('../db');

const PHRASES_JSON = path.resolve(__dirname, '..', '..', 'phrases.json');

function rowToPhrase(r) {
  return {
    id: r.id,
    employeeId: r.employee_id,
    title: r.title || '',
    content: r.content || '',
    sortOrder: r.sort_order || 0,
    createdAt: r.created_at || null,
  };
}

function normalizeIncoming(payload) {
  return {
    employee_id: payload.employeeId ? Number(payload.employeeId) : null,
    title: (payload.title || '').toString().trim() || null,
    content: (payload.content || '').toString().trim(),
    sort_order: Number.isInteger(payload.sortOrder) ? payload.sortOrder : 0,
  };
}

function validate(row, { requireEmployee = true } = {}) {
  if (requireEmployee && !row.employee_id) {
    const e = new Error('EMPLOYEE_REQUIRED'); e.code = 'EMPLOYEE_REQUIRED'; throw e;
  }
  if (!row.content) {
    const e = new Error('CONTENT_REQUIRED'); e.code = 'CONTENT_REQUIRED'; throw e;
  }
}

// ─── JSON 구현 ───
function jsonLoadRaw() {
  try {
    const raw = fs.readFileSync(PHRASES_JSON, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.phrases) ? parsed : { phrases: [] };
  } catch {
    return { phrases: [] };
  }
}
function jsonSave(phrases) {
  fs.writeFileSync(PHRASES_JSON, JSON.stringify({ phrases }, null, 2), 'utf-8');
}

async function listJson(employeeId) {
  let list = jsonLoadRaw().phrases || [];
  if (employeeId) list = list.filter(p => Number(p.employee_id) === Number(employeeId));
  return list.slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)
      || (a.created_at || '').localeCompare(b.created_at || ''))
    .map(rowToPhrase);
}

async function insertOneJson(payload) {
  const raw = jsonLoadRaw();
  const list = raw.phrases || [];
  const row = normalizeIncoming(payload);
  validate(row);
  const nextId = list.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
  const newRow = { id: nextId, ...row, created_at: new Date().toISOString() };
  list.push(newRow);
  raw.phrases = list;
  jsonSave(list);
  return rowToPhrase(newRow);
}

async function updateOneJson(id, payload) {
  const raw = jsonLoadRaw();
  const list = raw.phrases || [];
  const numId = Number(id);
  const idx = list.findIndex(r => r.id === numId);
  if (idx === -1) { const e = new Error('NOT_FOUND'); e.code = 'NOT_FOUND'; throw e; }
  const row = normalizeIncoming(payload);
  // 수정 시 employee_id 변경은 허용하지 않음(소속 고정) — content만 필수 검증.
  validate(row, { requireEmployee: false });
  list[idx] = { ...list[idx], title: row.title, content: row.content };
  raw.phrases = list;
  jsonSave(list);
  return rowToPhrase(list[idx]);
}

async function removeOneJson(id) {
  const raw = jsonLoadRaw();
  const list = raw.phrases || [];
  const numId = Number(id);
  const idx = list.findIndex(r => r.id === numId);
  if (idx === -1) return;
  list.splice(idx, 1);
  raw.phrases = list;
  jsonSave(list);
}

// ─── Supabase 구현 ───
async function listSupabase(employeeId) {
  let q = supabase.from('phrases').select('*');
  if (employeeId) q = q.eq('employee_id', Number(employeeId));
  const { data, error } = await q
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToPhrase);
}

async function insertOneSupabase(payload) {
  const row = normalizeIncoming(payload);
  validate(row);
  const { data, error } = await supabase.from('phrases').insert(row).select().single();
  if (error) throw error;
  return rowToPhrase(data);
}

async function updateOneSupabase(id, payload) {
  const row = normalizeIncoming(payload);
  validate(row, { requireEmployee: false });
  // employee_id는 갱신 대상에서 제외(소속 고정).
  const { data, error } = await supabase
    .from('phrases')
    .update({ title: row.title, content: row.content })
    .eq('id', Number(id)).select().single();
  if (error) {
    if (error.code === 'PGRST116') { const e = new Error('NOT_FOUND'); e.code = 'NOT_FOUND'; throw e; }
    throw error;
  }
  return rowToPhrase(data);
}

async function removeOneSupabase(id) {
  const { error } = await supabase.from('phrases').delete().eq('id', Number(id));
  if (error) throw error;
}

// ─── 공용 API ───
async function list(employeeId) {
  return config.USE_SUPABASE ? listSupabase(employeeId) : listJson(employeeId);
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
