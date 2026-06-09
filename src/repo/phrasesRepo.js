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
    pinned: !!r.pinned, // [요청] 직원별 최대 3개 최상단 고정
    createdAt: r.created_at || null,
  };
}

// [요청] 직원별 최대 3개 최상단 고정 — 한 직원이 고정할 수 있는 최대 문구 수.
const PIN_LIMIT = 3;

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
  // [요청] 고정(pinned) 우선 → sort_order → created_at 순.
  return list.slice()
    .sort((a, b) => (Number(!!b.pinned) - Number(!!a.pinned))
      || (a.sort_order || 0) - (b.sort_order || 0)
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

// [요청] 직원별 최대 3개 최상단 고정 — 핀 토글. 켤 때만 직원당 3개 제한 검증.
async function setPinnedJson(id, pinned) {
  const raw = jsonLoadRaw();
  const list = raw.phrases || [];
  const numId = Number(id);
  const idx = list.findIndex(r => r.id === numId);
  if (idx === -1) { const e = new Error('NOT_FOUND'); e.code = 'NOT_FOUND'; throw e; }
  const target = list[idx];
  if (pinned) {
    const pinnedCount = list.filter(r =>
      Number(r.employee_id) === Number(target.employee_id) && r.pinned && r.id !== numId).length;
    if (pinnedCount >= PIN_LIMIT) { const e = new Error('PIN_LIMIT'); e.code = 'PIN_LIMIT'; throw e; }
  }
  list[idx] = { ...target, pinned: !!pinned };
  raw.phrases = list;
  jsonSave(list);
  return rowToPhrase(list[idx]);
}

// ─── Supabase 구현 ───
async function listSupabase(employeeId) {
  let q = supabase.from('phrases').select('*');
  if (employeeId) q = q.eq('employee_id', Number(employeeId));
  const { data, error } = await q
    // [요청] 고정(pinned) 우선 → sort_order → created_at 순.
    .order('pinned', { ascending: false })
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

// [요청] 직원별 최대 3개 최상단 고정 — 핀 토글. 켤 때만 직원당 3개 제한 검증.
async function setPinnedSupabase(id, pinned) {
  // 대상 문구의 employee_id 조회 (제한 카운트 기준).
  const { data: target, error: getErr } = await supabase
    .from('phrases').select('id, employee_id').eq('id', Number(id)).single();
  if (getErr) {
    if (getErr.code === 'PGRST116') { const e = new Error('NOT_FOUND'); e.code = 'NOT_FOUND'; throw e; }
    throw getErr;
  }
  if (pinned) {
    const { count, error: cntErr } = await supabase
      .from('phrases')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', target.employee_id)
      .eq('pinned', true)
      .neq('id', Number(id));
    if (cntErr) throw cntErr;
    if ((count || 0) >= PIN_LIMIT) { const e = new Error('PIN_LIMIT'); e.code = 'PIN_LIMIT'; throw e; }
  }
  const { data, error } = await supabase
    .from('phrases').update({ pinned: !!pinned }).eq('id', Number(id)).select().single();
  if (error) throw error;
  return rowToPhrase(data);
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
// [요청] 직원별 최대 3개 최상단 고정
async function setPinned(id, pinned) {
  return config.USE_SUPABASE ? setPinnedSupabase(id, pinned) : setPinnedJson(id, pinned);
}

module.exports = { list, insertOne, updateOne, removeOne, setPinned };
