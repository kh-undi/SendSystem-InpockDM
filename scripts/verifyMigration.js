// [요청] Supabase 메인 DB 이전 — 4단계 검증: 이관 결과 spot check
const { supabase } = require('../src/db');

async function count(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`[count ${table}] ${error.message}`);
  return count;
}

async function main() {
  const tables = [
    'accounts', 'weekly_tracking', 'email_accounts',
    'products', 'product_photos', 'influencers',
    'sent_log', 'reply_runs', 'replies', 'settings',
  ];
  console.log('=== 테이블별 row 수 ===');
  for (const t of tables) {
    console.log(`  ${t.padEnd(20)} ${await count(t)}`);
  }

  console.log('\n=== products[0] + 사진 ===');
  const { data: p } = await supabase
    .from('products')
    .select('id, name, brand_name, product_photos(url, sort_order)')
    .order('id').limit(1).single();
  console.log(JSON.stringify(p, null, 2));

  console.log('\n=== 활성 계정 첫 3건 + weeklyTracking ===');
  const { data: accs } = await supabase
    .from('accounts')
    .select('id, username, weekly_tracking(week_key, count)')
    .order('id').limit(3);
  console.log(JSON.stringify(accs, null, 2));

  console.log('\n=== influencer status 분포 ===');
  const statuses = ['pending', 'sent', 'failed', 'skipped'];
  for (const s of statuses) {
    const { count: c } = await supabase
      .from('influencers').select('*', { count: 'exact', head: true }).eq('status', s);
    console.log(`  ${s.padEnd(10)} ${c}`);
  }
}

main().catch(e => { console.error('[error]', e.message || e); process.exit(1); });
