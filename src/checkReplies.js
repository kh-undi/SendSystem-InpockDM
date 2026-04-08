const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const selectors = require('./selectors');
const { login, logout } = require('./auth');

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

  // 신규 탭 생성
  const newTab = await context.newPage();
  newTab.setDefaultTimeout(config.NAVIGATION_TIMEOUT);

  let replyCount = 0;
  let error = null;

  try {
    await newTab.goto(selectors.chat.pageUrl, {
      waitUntil: 'networkidle',
      timeout: config.NAVIGATION_TIMEOUT,
    });

    // 팝업 닫기 (있을 경우)
    try {
      const modalBtn = newTab.getByRole('button', { name: '오늘 그만 보기' });
      await modalBtn.waitFor({ state: 'visible', timeout: 3000 });
      await modalBtn.click();
    } catch {}

    await newTab.waitForTimeout(2000);

    // sendbird 뱃지 개수 = 답장 보낸 사람 수
    const badges = await newTab.$$(selectors.chat.badge);
    replyCount = badges.length;

    console.log(`${tag} [답장확인] 답장 ${replyCount}건`);
  } catch (e) {
    error = e.message;
    console.error(`${tag} [답장확인 실패] ${e.message}`);
  } finally {
    await newTab.close().catch(() => {});
  }

  // 로그아웃
  await logout(page, account.username);

  return { account: account.username, replyCount, error };
}

async function main() {
  console.log('========================================');
  console.log('  답장 확인 매크로');
  console.log('========================================');

  let accounts = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'accounts.json'), 'utf-8')
  );

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

  const startedAt = new Date().toISOString();
  const repliesPath = path.join(__dirname, '..', 'replies.json');

  // [요청] 계정 하나 끝날 때마다 결과 파일을 즉시 갱신해 UI에서 실시간 반영되도록
  const writeResults = (partial) => {
    fs.writeFileSync(
      repliesPath,
      JSON.stringify({ checkedAt: startedAt, partial, results }, null, 2),
      'utf-8'
    );
  };

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(config.NAVIGATION_TIMEOUT);

  const results = [];

  // 시작 시점에 빈 결과 파일 작성 (이전 결과 클리어)
  writeResults(true);

  try {
    for (const account of accounts) {
      console.log(`\n──── 계정 ${account.id} (${account.username}) ────`);
      const result = await checkRepliesForAccount(context, page, account);
      results.push(result);
      // [요청] 계정 하나 처리 직후 결과 파일 갱신 → UI 실시간 반영
      writeResults(true);
    }
  } catch (e) {
    console.error('[치명적 오류]', e.message);
  } finally {
    await browser.close();
  }

  // 최종 결과 저장 (완료 표시)
  writeResults(false);

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
