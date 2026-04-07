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

  const loggedIn = await login(page, account);
  if (!loggedIn) {
    return { account: account.username, replyCount: 0, error: '로그인 실패' };
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

  const accounts = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'accounts.json'), 'utf-8')
  );

  const browser = await chromium.launch({
    headless: config.HEADLESS,
    slowMo: config.SLOW_MO,
  });

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
    }
  } catch (e) {
    console.error('[치명적 오류]', e.message);
  } finally {
    await browser.close();
  }

  // 결과 파일 저장
  fs.writeFileSync(
    path.join(__dirname, '..', 'replies.json'),
    JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2),
    'utf-8'
  );

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
