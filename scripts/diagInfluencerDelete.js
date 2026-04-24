// [진단] influencers DELETE가 실제로 반영되는지 확인
// 테스트용 row 1개 insert → delete로 지워지는지만 검사 (실데이터 영향 없음)
const { supabase } = require('../src/db');

async function main() {
  const testNickname = '__DELETE_TEST__' + Date.now();

  // 1. test row insert
  const { data: ins, error: insErr } = await supabase
    .from('influencers')
    .insert({
      nickname: testNickname,
      profile_url: 'test.local/diag',
      product_name: '__test__',
      status: 'pending',
    })
    .select('id')
    .single();
  if (insErr) { console.error('[insert 실패]', insErr); process.exit(1); }
  console.log(`[insert] id=${ins.id} nickname=${testNickname}`);

  // 2. 조건부 DELETE — replaceAllPendingSupabase와 동일하게 status='pending' 전체 delete 대신,
  //    단일 id로 delete해서 RLS 차단 여부만 검증
  const { data: delData, error: delErr, count } = await supabase
    .from('influencers')
    .delete({ count: 'exact' })
    .eq('id', ins.id);
  console.log('[delete by id]', { error: delErr, rowsAffected: count, data: delData });

  // 3. 남아있는지 확인
  const { data: remain } = await supabase
    .from('influencers')
    .select('id, nickname')
    .eq('nickname', testNickname);
  console.log(`[남아있는 row 수]`, remain ? remain.length : 0);

  if (remain && remain.length === 0) {
    console.log('\n[OK] DELETE 정상 작동 — service_role 키 맞음');
  } else {
    console.log('\n[FAIL] DELETE가 반영 안 됨 — RLS 차단 의심 (publishable/anon 키일 가능성)');
    // 정리
    await supabase.from('influencers').delete().eq('nickname', testNickname);
  }

  // 4. status='pending' 전체 대상 delete의 count도 확인 (실제 삭제 없이 count 0 기대)
  const { count: pendingCount } = await supabase
    .from('influencers')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  console.log(`[현재 pending 행 수] ${pendingCount}`);
}

main().catch(e => { console.error(e); process.exit(1); });
