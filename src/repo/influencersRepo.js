// [요청] Supabase 메인 DB 이전 — influencers repo (dual-mode)
// JSON 모드: influencers.json (pending) + failed.json 2개 파일
// Supabase 모드: influencers 테이블 단일, status 컬럼으로 pending/sent/failed 구분
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { supabase } = require('../db');
const { readInfluencers } = require('../influencerReader');

const INFLUENCERS_JSON = path.resolve(__dirname, '..', '..', 'influencers.json');
const FAILED_JSON = path.resolve(__dirname, '..', '..', 'failed.json');

function readJsonFile(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return fallback; }
}
function writeJsonFile(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}

// ─── JSON 구현 ───
async function listPendingJson() {
  // 기존 readInfluencersAuto()와 동일한 JSON→CSV fallback 로직
  if (fs.existsSync(INFLUENCERS_JSON)) {
    const data = readJsonFile(INFLUENCERS_JSON, []);
    if (Array.isArray(data) && data.length > 0) {
      const valid = data.filter(r => r.nickname && r.profileUrl && r.productName);
      return valid;
    }
  }
  return readInfluencers();
}

async function listFailedJson() {
  return readJsonFile(FAILED_JSON, []);
}

async function replaceAllPendingJson(list) {
  writeJsonFile(INFLUENCERS_JSON, list);
}

async function resetRunStateJson() {
  writeJsonFile(FAILED_JSON, []);
}

async function markFailedJson(influencer, errorMsg) {
  const current = readJsonFile(FAILED_JSON, []);
  current.push({ ...influencer, error: errorMsg });
  writeJsonFile(FAILED_JSON, current);
}

// [요청] 발송한 인플루언서 건바이건 삭제 — JSON 모드: influencers.json에서 즉시 제거
async function markSentJson(influencer) {
  const current = readJsonFile(INFLUENCERS_JSON, []);
  if (!Array.isArray(current) || current.length === 0) return;
  const filtered = current.filter(row => {
    if (influencer.id != null && row.id != null) return row.id !== influencer.id;
    return !(
      row.nickname === influencer.nickname &&
      row.profileUrl === influencer.profileUrl &&
      row.productName === influencer.productName
    );
  });
  if (filtered.length !== current.length) writeJsonFile(INFLUENCERS_JSON, filtered);
}

async function clearFailedJson() {
  if (fs.existsSync(FAILED_JSON)) fs.unlinkSync(FAILED_JSON);
}

async function requeueFailedJson() {
  const failed = readJsonFile(FAILED_JSON, []);
  const current = readJsonFile(INFLUENCERS_JSON, []);
  const toAdd = failed.map(({ nickname, profileUrl, productName }) =>
    ({ nickname, profileUrl, productName }));
  writeJsonFile(INFLUENCERS_JSON, [...current, ...toAdd]);
  if (fs.existsSync(FAILED_JSON)) fs.unlinkSync(FAILED_JSON);
  return { added: toAdd.length };
}

// ─── Supabase 구현 ───
function rowToInfluencer(r) {
  return {
    id: r.id,
    nickname: r.nickname,
    profileUrl: r.profile_url,
    productName: r.product_name,
    ...(r.error != null ? { error: r.error } : {}),
  };
}

async function listPendingSupabase() {
  const { data, error } = await supabase
    .from('influencers')
    .select('id, nickname, profile_url, product_name')
    .eq('status', 'pending')
    .order('id');
  if (error) throw error;
  return data.map(rowToInfluencer);
}

async function listFailedSupabase() {
  const { data, error } = await supabase
    .from('influencers')
    .select('id, nickname, profile_url, product_name, error')
    .eq('status', 'failed')
    .order('id');
  if (error) throw error;
  return data.map(rowToInfluencer);
}

async function replaceAllPendingSupabase(list) {
  // status='pending'만 교체. sent/failed 이력은 보존.
  const { error: delErr } = await supabase
    .from('influencers').delete().eq('status', 'pending');
  if (delErr) throw delErr;
  if (!list || !list.length) return;
  const rows = list.map(i => ({
    nickname: i.nickname,
    profile_url: i.profileUrl,
    product_name: i.productName,
    status: 'pending',
  }));
  // batch insert
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from('influencers').insert(rows.slice(i, i + 200));
    if (error) throw error;
  }
}

async function resetRunStateSupabase() {
  // run 시작 시 이전 failed 정리 (JSON 모드의 failed.json 초기화와 동등)
  const { error } = await supabase.from('influencers').delete().eq('status', 'failed');
  if (error) throw error;
}

async function markFailedSupabase(influencer, errorMsg) {
  if (influencer.id != null) {
    const { error } = await supabase.from('influencers')
      .update({ status: 'failed', error: errorMsg, updated_at: new Date().toISOString() })
      .eq('id', influencer.id);
    if (error) throw error;
    return;
  }
  // id가 없으면 natural key로 조회 후 업데이트, 없으면 신규 insert
  const { data: rows } = await supabase.from('influencers')
    .select('id').eq('nickname', influencer.nickname)
    .eq('profile_url', influencer.profileUrl)
    .eq('status', 'pending').limit(1);
  if (rows && rows.length) {
    await supabase.from('influencers')
      .update({ status: 'failed', error: errorMsg })
      .eq('id', rows[0].id);
  } else {
    await supabase.from('influencers').insert({
      nickname: influencer.nickname,
      profile_url: influencer.profileUrl,
      product_name: influencer.productName,
      status: 'failed',
      error: errorMsg,
    });
  }
}

// [요청] 발송한 인플루언서 건바이건 삭제 — Supabase 모드: DB row 물리 제거
// 감사 이력은 sent_log 테이블이 담당하므로 influencers에선 삭제해도 무방
async function markSentSupabase(influencer) {
  if (influencer.id != null) {
    const { error } = await supabase.from('influencers')
      .delete().eq('id', influencer.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('influencers')
      .delete()
      .eq('nickname', influencer.nickname)
      .eq('profile_url', influencer.profileUrl)
      .eq('status', 'pending');
    if (error) throw error;
  }
}

async function clearFailedSupabase() {
  await supabase.from('influencers').delete().eq('status', 'failed');
}

async function requeueFailedSupabase() {
  const { data: failed, error: fetchErr } = await supabase.from('influencers')
    .select('id').eq('status', 'failed');
  if (fetchErr) throw fetchErr;
  const ids = (failed || []).map(r => r.id);
  if (!ids.length) return { added: 0 };
  const { error } = await supabase.from('influencers')
    .update({ status: 'pending', error: null, updated_at: new Date().toISOString() })
    .in('id', ids);
  if (error) throw error;
  return { added: ids.length };
}

// ─── 공용 API ───
async function listPending() {
  return config.USE_SUPABASE ? listPendingSupabase() : listPendingJson();
}
async function listFailed() {
  return config.USE_SUPABASE ? listFailedSupabase() : listFailedJson();
}
async function replaceAllPending(list) {
  return config.USE_SUPABASE ? replaceAllPendingSupabase(list) : replaceAllPendingJson(list);
}
async function resetRunState() {
  return config.USE_SUPABASE ? resetRunStateSupabase() : resetRunStateJson();
}
async function markFailed(influencer, errorMsg) {
  return config.USE_SUPABASE
    ? markFailedSupabase(influencer, errorMsg)
    : markFailedJson(influencer, errorMsg);
}
async function markSent(influencer) {
  return config.USE_SUPABASE ? markSentSupabase(influencer) : markSentJson(influencer);
}
async function clearFailed() {
  return config.USE_SUPABASE ? clearFailedSupabase() : clearFailedJson();
}
async function requeueFailed() {
  return config.USE_SUPABASE ? requeueFailedSupabase() : requeueFailedJson();
}

module.exports = {
  listPending, listFailed, replaceAllPending,
  resetRunState, markFailed, markSent,
  clearFailed, requeueFailed,
};
