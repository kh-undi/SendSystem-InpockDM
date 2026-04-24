// [요청] Supabase 메인 DB 이전 — replies repo (dual-mode)
// JSON 모드: replies.json 단일 스냅샷(checkedAt, partial, results[])
// Supabase 모드: reply_runs + replies 테이블 (partial = finished_at IS NULL)
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { supabase } = require('../db');

const REPLIES_JSON = path.resolve(__dirname, '..', '..', 'replies.json');

// ─── JSON ───
function readFile() {
  if (!fs.existsSync(REPLIES_JSON)) return null;
  try { return JSON.parse(fs.readFileSync(REPLIES_JSON, 'utf-8')); } catch { return null; }
}
function writeFile(data) {
  fs.writeFileSync(REPLIES_JSON, JSON.stringify(data, null, 2), 'utf-8');
}

async function startRunJson() {
  const startedAt = new Date().toISOString();
  writeFile({ checkedAt: startedAt, partial: true, results: [] });
  return { runId: null, startedAt };
}
async function addResultJson(_runId, result) {
  const current = readFile() || { checkedAt: new Date().toISOString(), partial: true, results: [] };
  current.results.push(result);
  writeFile(current);
}
async function finishRunJson(_runId) {
  const current = readFile();
  if (current) {
    current.partial = false;
    writeFile(current);
  }
}
async function getLatestJson() {
  return readFile();
}

// ─── Supabase ───
async function startRunSupabase() {
  const { data, error } = await supabase
    .from('reply_runs')
    .insert({ started_at: new Date().toISOString() })
    .select('id, started_at')
    .single();
  if (error) throw error;
  return { runId: data.id, startedAt: data.started_at };
}

async function addResultSupabase(runId, result) {
  const { error } = await supabase.from('replies').insert({
    run_id: runId,
    account_username: result.account,
    reply_count: result.replyCount || 0,
    error: result.error || null,
    checked_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function finishRunSupabase(runId) {
  const { error } = await supabase
    .from('reply_runs')
    .update({ finished_at: new Date().toISOString() })
    .eq('id', runId);
  if (error) throw error;
}

async function getLatestSupabase() {
  const { data: runs, error: rErr } = await supabase
    .from('reply_runs')
    .select('id, started_at, finished_at')
    .order('started_at', { ascending: false })
    .limit(1);
  if (rErr) throw rErr;
  if (!runs || !runs.length) return null;
  const run = runs[0];
  const { data: rows, error: pErr } = await supabase
    .from('replies')
    .select('account_username, reply_count, error, checked_at')
    .eq('run_id', run.id)
    .order('checked_at', { ascending: true });
  if (pErr) throw pErr;
  return {
    checkedAt: run.started_at,
    partial: run.finished_at == null,
    results: (rows || []).map(r => ({
      account: r.account_username,
      replyCount: r.reply_count || 0,
      error: r.error || null,
    })),
  };
}

// ─── 공용 ───
async function startRun() {
  return config.USE_SUPABASE ? startRunSupabase() : startRunJson();
}
async function addResult(runId, result) {
  return config.USE_SUPABASE ? addResultSupabase(runId, result) : addResultJson(runId, result);
}
async function finishRun(runId) {
  return config.USE_SUPABASE ? finishRunSupabase(runId) : finishRunJson(runId);
}
async function getLatest() {
  return config.USE_SUPABASE ? getLatestSupabase() : getLatestJson();
}

module.exports = { startRun, addResult, finishRun, getLatest };
