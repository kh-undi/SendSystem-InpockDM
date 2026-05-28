// [요청] 리드 관리 탭 신설 (답장 온 인플루언서 추적) — leads repo (dual-mode)
// list() 반환 구조: { id, nickname, profileUrl, interestedProductName, suitableProductNote,
//                     repliedAt, proposalSentAt, remindAt, finalStatus, notes,
//                     collaborationConverted, createdAt, updatedAt }
// 날짜 필드는 ISO 'YYYY-MM-DD' 문자열 또는 null.
const fs = require('fs');
const config = require('../../config');
const { supabase } = require('../db');

const ALLOWED_STATUSES = ['pending', '거절', '공구진행', '무응답'];

// proposal_sent_at + 3일 자동 계산. UTC 기준으로 처리해야 toISOString 변환 시 timezone offset만큼 하루 어긋나지 않음.
function autoRemindAt(proposalSentAt) {
  if (!proposalSentAt) return null;
  const d = new Date(proposalSentAt + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 3);
  return d.toISOString().slice(0, 10);
}

// today를 로컬 날짜 기준으로 계산 (한국 사용자 — UTC면 오전 9시 이전이 전날로 잡힘).
function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sanitizeStatus(s) {
  if (!s) return 'pending';
  return ALLOWED_STATUSES.includes(s) ? s : 'pending';
}

// 들어오는 payload를 DB row 형태로 정규화. JSON/Supabase 양쪽에서 공용.
function normalizeIncoming(payload) {
  const proposalSentAt = payload.proposalSentAt || null;
  const remindAt = payload.remindAt || autoRemindAt(proposalSentAt);
  return {
    nickname: String(payload.nickname || '').trim(),
    profile_url: payload.profileUrl || null,
    interested_product_name: payload.interestedProductName || null,
    suitable_product_note: payload.suitableProductNote || null,
    replied_at: payload.repliedAt || null,
    proposal_sent_at: proposalSentAt,
    remind_at: remindAt,
    final_status: sanitizeStatus(payload.finalStatus),
    notes: payload.notes || null,
    // [요청] 리드 관리 — 카톡전환 컬럼/체크박스
    collaboration_converted: !!payload.collaborationConverted,
  };
}

// DB row → 클라용 camelCase 매핑
function rowToLead(r) {
  return {
    id: r.id,
    nickname: r.nickname || '',
    profileUrl: r.profile_url || '',
    interestedProductName: r.interested_product_name || '',
    suitableProductNote: r.suitable_product_note || '',
    repliedAt: r.replied_at || '',
    proposalSentAt: r.proposal_sent_at || '',
    remindAt: r.remind_at || '',
    finalStatus: r.final_status || 'pending',
    notes: r.notes || '',
    // [요청] 리드 관리 — 카톡전환 컬럼/체크박스
    collaborationConverted: !!r.collaboration_converted,
    createdAt: r.created_at || null,
    updatedAt: r.updated_at || null,
  };
}

// ─── JSON 구현 ───
function jsonLoadRaw() {
  try {
    const raw = fs.readFileSync(config.PATHS.leads, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.leads) ? parsed : { leads: [] };
  } catch {
    return { leads: [] };
  }
}
function jsonSave(leads) {
  fs.writeFileSync(config.PATHS.leads, JSON.stringify({ leads }, null, 2), 'utf-8');
}

async function listJson() {
  const list = jsonLoadRaw().leads || [];
  // 최신 created_at DESC, id ASC 정렬
  return list.slice().sort((a, b) => {
    const ca = a.created_at || '';
    const cb = b.created_at || '';
    if (ca !== cb) return cb.localeCompare(ca);
    return (a.id || 0) - (b.id || 0);
  }).map(r => rowToLead(r));
}

async function insertOneJson(payload) {
  const raw = jsonLoadRaw();
  const list = raw.leads || [];
  const row = normalizeIncoming(payload);
  if (!row.nickname) {
    const e = new Error('NICKNAME_REQUIRED');
    e.code = 'NICKNAME_REQUIRED';
    throw e;
  }
  const nextId = list.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
  const now = new Date().toISOString();
  const newRow = { id: nextId, ...row, created_at: now, updated_at: now };
  list.unshift(newRow);
  raw.leads = list;
  jsonSave(list);
  return rowToLead(newRow);
}

async function updateOneJson(id, payload) {
  const raw = jsonLoadRaw();
  const list = raw.leads || [];
  const numId = Number(id);
  const idx = list.findIndex(r => r.id === numId);
  if (idx === -1) {
    const e = new Error('NOT_FOUND');
    e.code = 'NOT_FOUND';
    throw e;
  }
  const row = normalizeIncoming(payload);
  if (!row.nickname) {
    const e = new Error('NICKNAME_REQUIRED');
    e.code = 'NICKNAME_REQUIRED';
    throw e;
  }
  list[idx] = {
    ...list[idx],
    ...row,
    updated_at: new Date().toISOString(),
  };
  raw.leads = list;
  jsonSave(list);
  return rowToLead(list[idx]);
}

async function removeOneJson(id) {
  const raw = jsonLoadRaw();
  const list = raw.leads || [];
  const numId = Number(id);
  const idx = list.findIndex(r => r.id === numId);
  if (idx === -1) return;
  list.splice(idx, 1);
  raw.leads = list;
  jsonSave(list);
}

async function listDueRemindersJson(today) {
  const t = today || todayIso();
  const list = jsonLoadRaw().leads || [];
  return list
    .filter(r => r.final_status === 'pending' && r.remind_at && r.remind_at <= t)
    .map(r => rowToLead(r));
}

// ─── Supabase 구현 ───
async function listSupabase() {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToLead);
}

async function insertOneSupabase(payload) {
  const row = normalizeIncoming(payload);
  if (!row.nickname) {
    const e = new Error('NICKNAME_REQUIRED');
    e.code = 'NICKNAME_REQUIRED';
    throw e;
  }
  const { data, error } = await supabase
    .from('leads').insert(row).select().single();
  if (error) throw error;
  return rowToLead(data);
}

async function updateOneSupabase(id, payload) {
  const numId = Number(id);
  const row = normalizeIncoming(payload);
  if (!row.nickname) {
    const e = new Error('NICKNAME_REQUIRED');
    e.code = 'NICKNAME_REQUIRED';
    throw e;
  }
  const { data, error } = await supabase
    .from('leads')
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq('id', numId)
    .select()
    .single();
  if (error) {
    if (error.code === 'PGRST116') {
      const e = new Error('NOT_FOUND');
      e.code = 'NOT_FOUND';
      throw e;
    }
    throw error;
  }
  return rowToLead(data);
}

async function removeOneSupabase(id) {
  const numId = Number(id);
  const { error } = await supabase.from('leads').delete().eq('id', numId);
  if (error) throw error;
}

async function listDueRemindersSupabase(today) {
  const t = today || todayIso();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('final_status', 'pending')
    .not('remind_at', 'is', null)
    .lte('remind_at', t)
    .order('remind_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToLead);
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
async function listDueReminders(today) {
  return config.USE_SUPABASE ? listDueRemindersSupabase(today) : listDueRemindersJson(today);
}

module.exports = {
  list,
  insertOne,
  updateOne,
  removeOne,
  listDueReminders,
  ALLOWED_STATUSES,
};
