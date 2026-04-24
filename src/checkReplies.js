const { chromium } = require('playwright');
const config = require('../config');
const selectors = require('./selectors');
const { login, logout } = require('./auth');
// [요청] Supabase 메인 DB 이전 — accounts/replies를 repo 경유로 로드·저장
const accountsRepo = require('./repo/accountsRepo');
const repliesRepo = require('./repo/repliesRepo');

/**
 * 각 계정 로그인 후 신규 탭을 열어 sendbird 뱃지(답장 온 메시지) 개수를 카운트
 * 뱃지 1개 = 1명에게서 답장이 옴
 */
async function checkRepliesForAccount(context, page, account) {
  const tag = `[${account.username}]`;

  // [요청] 로그인 실패 시 캐시비우기+새로고침 후 1회 재시도
  let loggedIn = await login(page, account);
  if (!loggedIn) {
    console.log(`${tag} [재시도] 로그인 실패 → 캐시 비우기 후 재시도`);
    try {
      await page.context().clearCookies();
      await page.goto(selectors.login.pageUrl, { waitUntil: 'networkidle', timeout: config.NAVIGATION_TIMEOUT });
      await page.reload({ waitUntil: 'networkidle' });
    } catch {}
    loggedIn = await login(page, account);
  }
  if (!loggedIn) {
    return { account: account.username, replyCount: 0, error: '로그인 실패 (재시도 포함)' };
  }

  const newTab = await context.newPage();
  newTab.setDefaultTimeout(config.NAVIGATION_TIMEOUT);

  let replyCount = 0;
  let error = null;

  try {
    await newTab.goto(selectors.chat.pageUrl, {
      waitUntil: 'networkidle',
      timeout: config.NAVIGATION_TIMEOUT,
    });

    try {
      const modalBtn = newTab.getByRole('button', { name: '오늘 그만 보기' });
      await modalBtn.waitFor({ state: 'visible', timeout: 3000 });
      await modalBtn.click();
    } catch {}

    await newTab.waitForTimeout(2000);

    const badges = await newTab.$$(selectors.chat.badge);
    replyCount = badges.length;

    console.log(`${tag} [답장확인] 답장 ${replyCount}건`);
  } catch (e) {
    error = e.message;
    console.error(`${tag} [답장확인 실패] ${e.message}`);
  } finally {
    await newTab.close().catch(() => {});
  }

  await logout(page, account.username);

  return { account: account.username, replyCount, error };
}

async function main() {
  console.log('========================================');
  console.log('  답장 확인 매크로');
  console.log('========================================');

  // [요청] accountsRepo 경유로 계정 로드
  let accounts = await accountsRepo.list();

  // [요청] --start <username> 인자가 있으면 해당 계정부터 순차 처리
  const startIdx = process.argv.indexOf('--start');
  if (startIdx !== -1 && process.argv[startIdx + 1]) {
    const startUsername = process.argv[startIdx + 1];
    const idx = accounts.findIndex(a => a.username === startUsername);
    if (idx >= 0) {
      console.log(`[시작 계정] ${startUsername} (인덱스 ${idx})부터 처리`);
      accounts = accounts.slice(idx);
    } else {
      console.warn(`[경고] 시작 계정 "${startUsername}"을 찾을 수 없음 → 전체 처리`);
    }
  }

  // [요청] 답장확인은 별도 크롬창 띄우지 않고 백그라운드(헤드리스)로 실행
  const browser = await chromium.launch({
    headless: true,
    slowMo: config.SLOW_MO,
  });

  // [요청] repliesRepo로 run 시작 — JSON 모드에서는 replies.json 초기화, Supabase 모드에서는 reply_runs 신규 row
  const { runId } = await repliesRepo.startRun();

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(config.NAVIGATION_TIMEOUT);

  const results = [];

  try {
    for (const account of accounts) {
      console.log(`\n──── 계정 ${account.id} (${account.username}) ────`);
      const result = await checkRepliesForAccount(context, page, account);
      results.push(result);
      // [요청] 계정 하나 처리 직후 저장 → UI 실시간 반영
      await repliesRepo.addResult(runId, result);
    }
  } catch (e) {
    console.error('[치명적 오류]', e.message);
  } finally {
    await browser.close();
  }

  // [요청] run 완료 표시
  await repliesRepo.finishRun(runId);

  // 결과 요약
  console.log('\n========================================');
  console.log('  답장 확인 결과');
  console.log('========================================');
  let totalReplies = 0;
  for (const r of results) {
    if (r.error) {
      console.log(`  ${r.account}: 오류 - ${r.error}`);
    } else if (r.replyCount > 0) {
      console.log(`  ${r.account}: ${r.replyCount}명에게서 답장`);
      totalReplies += r.replyCount;
    } else {
      console.log(`  ${r.account}: 답장 없음`);
    }
  }
  console.log('----------------------------------------');
  console.log(`  총 답장: ${totalReplies}건`);
  console.log('========================================');
}

main().catch(console.error);
