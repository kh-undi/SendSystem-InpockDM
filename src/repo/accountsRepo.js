// [요청] Supabase 메인 DB 이전 — accounts repo (dual-mode)
// USE_SUPABASE 플래그로 JSON 파일 / Supabase 분기.
// 모든 함수는 async. JSON 모드에서도 await 가능하도록 유지.
const fs = require('fs');
const config = require('../../config');
const { supabase } = require('../db');

// ─── JSON 구현 ───
function jsonLoad() {
  const raw = fs.readFileSync(config.PATHS.accounts, 'utf-8');
  return JSON.parse(raw);
}
function jsonSave(accounts) {
  fs.writeFileSync(config.PATHS.accounts, JSON.stringify(accounts, null, 2), 'utf-8');
}

async function listJson() {
  return jsonLoad();
}

async function incrementJson(accountId, weekKey) {
  const accounts = jsonLoad();
  const acc = accounts.find(a => a.id === accountId);
  if (!acc) throw new Error(`계정 ID ${accountId}를 찾을 수 없습니다.`);
  acc.weeklyTracking = acc.weeklyTracking || {};
  acc.weeklyTracking[weekKey] = (acc.weeklyTracking[weekKey] || 0) + 1;
  jsonSave(accounts);
  return acc.weeklyTracking[weekKey];
}

// [요청] 주간 카운트 강제 증감 — JSON 모드 ±delta (max(0, ...))
async function adjustJson(accountId, weekKey, delta) {
  const accounts = jsonLoad();
  const acc = accounts.find(a => a.id === accountId);
  if (!acc) throw new Error(`계정 ID ${accountId}를 찾을 수 없습니다.`);
  acc.weeklyTracking = acc.weeklyTracking || {};
  const next = Math.max(0, (acc.weeklyTracking[weekKey] || 0) + delta);
  acc.weeklyTracking[weekKey] = next;
  jsonSave(accounts);
  return next;
}

async function replaceAllJson(accounts) {
  // [요청] 설정 > 계정 추가 저장 안 됨 — id 결손 row(=신규)에 자동 id 부여 (Supabase는 SERIAL로 자동, JSON 모드만 보정)
  const existingIds = accounts.map(a => a.id).filter(id => id != null);
  let nextId = existingIds.length ? Math.max(...existingIds) + 1 : 1;
  const normalized = accounts.map(a => (a.id == null ? { ...a, id: nextId++ } : a));
  jsonSave(normalized);
}

async function resetAllWeeklyTrackingJson() {
  const accounts = jsonLoad();
  for (const a of accounts) a.weeklyTracking = {};
  jsonSave(accounts);
}

// ─── Supabase 구현 ───
async function listSupabase() {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, username, password, active, weekly_tracking(week_key, count)')
    .eq('active', true)
    .order('id');
  if (error) throw error;
  // 기존 JSON 구조로 정규화: weeklyTracking = { weekKey: count }
  return data.map(a => ({
    id: a.id,
    username: a.username,
    password: a.password,
    weeklyTracking: Object.fromEntries(
      (a.weekly_tracking || []).map(w => [w.week_key, w.count])
    ),
  }));
}

async function incrementSupabase(accountId, weekKey) {
  const { data, error } = await supabase.rpc('increment_weekly_count', {
    p_account_id: accountId,
    p_week_key: weekKey,
  });
  if (error) throw error;
  return data;
}

// [요청] 주간 카운트 강제 증감 — Supabase 원자적 ±delta RPC
async function adjustSupabase(accountId, weekKey, delta) {
  const { data, error } = await supabase.rpc('adjust_weekly_count', {
    p_account_id: accountId,
    p_week_key: weekKey,
    p_delta: delta,
  });
  if (error) throw error;
  return data;
}

async function replaceAllSupabase(accounts) {
  // UI에서 password·username 편집만 지원 (추가/삭제는 별도 엔드포인트로 분리 예정)
  // id 기준 update. id 없는 row는 insert.
  const updates = accounts.filter(a => a.id != null);
  const inserts = accounts.filter(a => a.id == null);

  for (const a of updates) {
    const { error } = await supabase
      .from('accounts')
      .update({ username: a.username, password: a.password })
      .eq('id', a.id);
    if (error) throw error;
  }
  if (inserts.length) {
    const rows = inserts.map(a => ({ username: a.username, password: a.password }));
    const { error } = await supabase.from('accounts').insert(rows);
    if (error) throw error;
  }
}

async function resetAllWeeklyTrackingSupabase() {
  const { error } = await supabase
    .from('weekly_tracking')
    .delete()
    .not('account_id', 'is', null);
  if (error) throw error;
}

// ─── 공용 API ───
async function list() {
  return config.USE_SUPABASE ? listSupabase() : listJson();
}

async function incrementSendCount(accountId, weekKey) {
  return config.USE_SUPABASE
    ? incrementSupabase(accountId, weekKey)
    : incrementJson(accountId, weekKey);
}

// [요청] 주간 카운트 강제 증감
async function adjustSendCount(accountId, weekKey, delta) {
  return config.USE_SUPABASE
    ? adjustSupabase(accountId, weekKey, delta)
    : adjustJson(accountId, weekKey, delta);
}

async function replaceAll(accounts) {
  return config.USE_SUPABASE
    ? replaceAllSupabase(accounts)
    : replaceAllJson(accounts);
}

async function resetAllWeeklyTracking() {
  return config.USE_SUPABASE
    ? resetAllWeeklyTrackingSupabase()
    : resetAllWeeklyTrackingJson();
}

module.exports = { list, incrementSendCount, adjustSendCount, replaceAll, resetAllWeeklyTracking };
