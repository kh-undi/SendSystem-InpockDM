// [요청] Supabase 메인 DB 이전 — email_accounts repo (dual-mode)
const fs = require('fs');
const config = require('../../config');
const { supabase } = require('../db');

// ─── JSON ───
async function listJson() {
  if (!fs.existsSync(config.PATHS.emailAccounts)) return [];
  try {
    return JSON.parse(fs.readFileSync(config.PATHS.emailAccounts, 'utf-8'));
  } catch {
    return [];
  }
}

async function replaceAllJson(list) {
  fs.writeFileSync(config.PATHS.emailAccounts, JSON.stringify(list, null, 2), 'utf-8');
}

// ─── Supabase ───
async function listSupabase() {
  const { data, error } = await supabase
    .from('email_accounts')
    .select('id, email, app_password, sender_name, signature, signature_image_url, active')
    .eq('active', true)
    .order('id');
  if (error) throw error;
  return data.map(a => ({
    id: a.id,
    email: a.email,
    appPassword: a.app_password,
    senderName: a.sender_name,
    signature: a.signature || '',
    signatureImage: a.signature_image_url || '',
  }));
}

async function replaceAllSupabase(list) {
  const updates = (list || []).filter(a => a.id != null);
  const inserts = (list || []).filter(a => a.id == null);

  for (const a of updates) {
    const { error } = await supabase.from('email_accounts').update({
      email: a.email,
      app_password: a.appPassword,
      sender_name: a.senderName,
      signature: a.signature || null,
      signature_image_url: a.signatureImage || null,
    }).eq('id', a.id);
    if (error) throw error;
  }
  if (inserts.length) {
    const rows = inserts.map(a => ({
      email: a.email,
      app_password: a.appPassword,
      sender_name: a.senderName,
      signature: a.signature || null,
      signature_image_url: a.signatureImage || null,
    }));
    const { error } = await supabase.from('email_accounts').insert(rows);
    if (error) throw error;
  }
}

// ─── 공용 API ───
async function list() {
  return config.USE_SUPABASE ? listSupabase() : listJson();
}

async function replaceAll(payload) {
  return config.USE_SUPABASE ? replaceAllSupabase(payload) : replaceAllJson(payload);
}

async function findById(id) {
  const all = await list();
  if (id == null) return all[0] || null;
  const idNum = Number(id);
  return all.find(a => a.id === idNum) || null;
}

module.exports = { list, replaceAll, findById };
