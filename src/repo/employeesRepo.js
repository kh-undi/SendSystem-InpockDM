// [요청] 자주 사용하는 문구 — 직원별 추가/복사 탭 신설 (dual-mode repo)
//   employees: 독립 범용 직원 테이블. 지금은 phrases가 참조하지만 향후 다른 테이블에서도 재사용 예정.
//   list() / getById(id) 반환 구조: { id, name, sortOrder, createdAt }
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { supabase } = require('../db');

const EMPLOYEES_JSON = path.resolve(__dirname, '..', '..', 'employees.json');
const PHRASES_JSON = path.resolve(__dirname, '..', '..', 'phrases.json');

function rowToEmployee(r) {
  return {
    id: r.id,
    name: r.name || '',
    sortOrder: r.sort_order || 0,
    createdAt: r.created_at || null,
  };
}

function normalizeIncoming(payload) {
  return {
    name: (payload.name || '').toString().trim(),
    sort_order: Number.isInteger(payload.sortOrder) ? payload.sortOrder : 0,
  };
}

// ─── JSON 구현 ───
function jsonLoadRaw() {
  try {
    const raw = fs.readFileSync(EMPLOYEES_JSON, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.employees) ? parsed : { employees: [] };
  } catch {
    return { employees: [] };
  }
}
function jsonSave(employees) {
  fs.writeFileSync(EMPLOYEES_JSON, JSON.stringify({ employees }, null, 2), 'utf-8');
}

async function listJson() {
  const list = jsonLoadRaw().employees || [];
  return list.slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (a.id || 0) - (b.id || 0))
    .map(rowToEmployee);
}

async function insertOneJson(payload) {
  const raw = jsonLoadRaw();
  const list = raw.employees || [];
  const row = normalizeIncoming(payload);
  if (!row.name) { const e = new Error('NAME_REQUIRED'); e.code = 'NAME_REQUIRED'; throw e; }
  const nextId = list.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
  const newRow = { id: nextId, ...row, created_at: new Date().toISOString() };
  list.push(newRow);
  raw.employees = list;
  jsonSave(list);
  return rowToEmployee(newRow);
}

async function updateOneJson(id, payload) {
  const raw = jsonLoadRaw();
  const list = raw.employees || [];
  const numId = Number(id);
  const idx = list.findIndex(r => r.id === numId);
  if (idx === -1) { const e = new Error('NOT_FOUND'); e.code = 'NOT_FOUND'; throw e; }
  const row = normalizeIncoming(payload);
  if (!row.name) { const e = new Error('NAME_REQUIRED'); e.code = 'NAME_REQUIRED'; throw e; }
  list[idx] = { ...list[idx], ...row };
  raw.employees = list;
  jsonSave(list);
  return rowToEmployee(list[idx]);
}

// JSON 모드는 FK cascade가 없으므로 해당 직원의 phrases도 직접 정리해 Supabase on delete cascade를 흉내낸다.
function cascadeDeletePhrasesJson(employeeId) {
  try {
    const raw = JSON.parse(fs.readFileSync(PHRASES_JSON, 'utf-8'));
    const list = Array.isArray(raw.phrases) ? raw.phrases : [];
    const kept = list.filter(p => Number(p.employee_id) !== Number(employeeId));
    if (kept.length !== list.length) {
      fs.writeFileSync(PHRASES_JSON, JSON.stringify({ phrases: kept }, null, 2), 'utf-8');
    }
  } catch { /* phrases.json 없으면 무시 */ }
}

async function removeOneJson(id) {
  const raw = jsonLoadRaw();
  const list = raw.employees || [];
  const numId = Number(id);
  const idx = list.findIndex(r => r.id === numId);
  if (idx === -1) return;
  list.splice(idx, 1);
  raw.employees = list;
  jsonSave(list);
  cascadeDeletePhrasesJson(numId);
}

// ─── Supabase 구현 ───
async function listSupabase() {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToEmployee);
}

async function insertOneSupabase(payload) {
  const row = normalizeIncoming(payload);
  if (!row.name) { const e = new Error('NAME_REQUIRED'); e.code = 'NAME_REQUIRED'; throw e; }
  const { data, error } = await supabase.from('employees').insert(row).select().single();
  if (error) throw error;
  return rowToEmployee(data);
}

async function updateOneSupabase(id, payload) {
  const row = normalizeIncoming(payload);
  if (!row.name) { const e = new Error('NAME_REQUIRED'); e.code = 'NAME_REQUIRED'; throw e; }
  const { data, error } = await supabase
    .from('employees').update(row).eq('id', Number(id)).select().single();
  if (error) {
    if (error.code === 'PGRST116') { const e = new Error('NOT_FOUND'); e.code = 'NOT_FOUND'; throw e; }
    throw error;
  }
  return rowToEmployee(data);
}

async function removeOneSupabase(id) {
  // phrases.employee_id 는 on delete cascade 이므로 자식 문구도 자동 삭제됨.
  const { error } = await supabase.from('employees').delete().eq('id', Number(id));
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
