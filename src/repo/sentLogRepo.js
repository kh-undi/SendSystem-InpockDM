// [요청] Supabase 메인 DB 이전 — sent_log repo (dual-mode, append-only)
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { supabase } = require('../db');

function ensureLogDir() {
  const logDir = path.dirname(config.PATHS.sentLog);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
}

// ─── JSON ───
async function appendJson(entry) {
  ensureLogDir();
  const line = `${entry.timestamp},${entry.accountId},${entry.nickname},${entry.profileUrl},${entry.productName}\n`;
  fs.appendFileSync(config.PATHS.sentLog, line, 'utf-8');
}

async function listJson() {
  if (!fs.existsSync(config.PATHS.sentLog)) return [];
  const content = fs.readFileSync(config.PATHS.sentLog, 'utf-8');
  return content.split('\n').filter(l => l.trim()).map(line => {
    const [timestamp, accountId, nickname, profileUrl, productName] = line.split(',');
    return { timestamp, accountId, nickname, profileUrl, productName };
  });
}

// ─── Supabase ───
async function appendSupabase(entry) {
  // accountId가 "mail:1"·"dry-run" 같은 문자열일 수 있음. 정수 아니면 null로 저장.
  const n = parseInt(entry.accountId, 10);
  const account_id = Number.isFinite(n) && String(n) === String(entry.accountId) ? n : null;
  const { error } = await supabase.from('sent_log').insert({
    account_id,
    nickname: entry.nickname || null,
    profile_url: entry.profileUrl || null,
    product_name: entry.productName || null,
    sent_at: entry.timestamp,
  });
  if (error) throw error;
}

async function listSupabase() {
  const { data, error } = await supabase
    .from('sent_log')
    .select('sent_at, account_id, nickname, profile_url, product_name')
    .order('sent_at', { ascending: true })
    .limit(2000);
  if (error) throw error;
  return data.map(r => ({
    timestamp: r.sent_at,
    accountId: r.account_id != null ? String(r.account_id) : '',
    nickname: r.nickname || '',
    profileUrl: r.profile_url || '',
    productName: r.product_name || '',
  }));
}

// ─── 공용 ───
async function append(accountId, influencer) {
  const entry = {
    timestamp: new Date().toISOString(),
    accountId: String(accountId),
    nickname: influencer.nickname,
    profileUrl: influencer.profileUrl,
    productName: influencer.productName,
  };
  return config.USE_SUPABASE ? appendSupabase(entry) : appendJson(entry);
}

async function list() {
  return config.USE_SUPABASE ? listSupabase() : listJson();
}

module.exports = { append, list };
