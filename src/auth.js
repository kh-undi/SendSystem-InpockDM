const config = require('../config');
const selectors = require('./selectors');

/**
 * 인포크비즈니스 로그인
 */
async function login(page, account) {
  const tag = `[${account.username}]`;
  console.log(`${tag} [로그인] 로그인 시도...`);

  try {
    await page.goto(selectors.login.pageUrl, {
      waitUntil: 'networkidle',
      timeout: config.NAVIGATION_TIMEOUT,
    });

    await page.waitForSelector(selectors.login.usernameInput, { timeout: 10000 });
    await page.fill(selectors.login.usernameInput, account.username);
    await page.fill(selectors.login.passwordInput, account.password);
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: '인포크비즈니스 로그인' }).click();
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: config.NAVIGATION_TIMEOUT });

    console.log(`${tag} [로그인] 로그인 성공!`);

    // 캐시 비우기 + 새로고침 (쿠키/세션은 유지)
    try {
      const client = await page.context().newCDPSession(page);
      await client.send('Network.clearBrowserCache');
      await client.detach();
    } catch {}
    await page.reload({ waitUntil: 'networkidle' });
    console.log(`${tag} [로그인] 캐시 비우기 + 새로고침 완료`);

    return true;
  } catch (error) {
    console.error(`${tag} [로그인 실패] ${error.message}`);
    console.log(`${tag} [로그인] 캐시 비우기 + 새로고침 후 재시도...`);

    // 캐시 비우기
    try {
      const client = await page.context().newCDPSession(page);
      await client.send('Network.clearBrowserCache');
      await client.detach();
    } catch {}
    await page.context().clearCookies();

    // 새로고침 후 재시도
    try {
      await page.goto(selectors.login.pageUrl, {
        waitUntil: 'networkidle',
        timeout: config.NAVIGATION_TIMEOUT,
      });

      await page.waitForSelector(selectors.login.usernameInput, { timeout: 10000 });
      await page.fill(selectors.login.usernameInput, account.username);
      await page.fill(selectors.login.passwordInput, account.password);
      await page.waitForTimeout(500);

      await page.getByRole('button', { name: '인포크비즈니스 로그인' }).click();
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: config.NAVIGATION_TIMEOUT });

      console.log(`${tag} [로그인] 재시도 성공!`);

      try {
        const client2 = await page.context().newCDPSession(page);
        await client2.send('Network.clearBrowserCache');
        await client2.detach();
      } catch {}
      await page.reload({ waitUntil: 'networkidle' });
      console.log(`${tag} [로그인] 캐시 비우기 + 새로고침 완료`);

      return true;
    } catch (retryError) {
      console.error(`${tag} [로그인 재시도 실패] ${retryError.message}`);
      return false;
    }
  }
}

/**
 * 인포크비즈니스 로그아웃
 */
async function logout(page, accountName = '') {
  const tag = `[${accountName}]`;
  console.log(`${tag} [로그아웃] 로그아웃 시도...`);

  try {
    await page.goto(selectors.logout.adminPageUrl, {
      waitUntil: 'networkidle',
      timeout: config.NAVIGATION_TIMEOUT,
    });
    await page.waitForTimeout(1000);

    // 팝업 모달 닫기 ("오늘 그만 보기")
    try {
      const modalBtn = page.getByRole('button', { name: '오늘 그만 보기' });
      await modalBtn.waitFor({ state: 'visible', timeout: 3000 });
      await modalBtn.click();
      console.log(`${tag} [로그아웃] 팝업 모달 닫기 완료`);
      await page.waitForTimeout(500);
    } catch {
      // 모달 안 뜨면 무시
    }

    // 드롭다운 영역 클릭
    await page.locator('div.css-ns5dcw').first().click();
    await page.waitForTimeout(500);

    // "로그아웃" 메뉴 클릭
    await page.getByText('로그아웃', { exact: true }).first().click();
    await page.waitForTimeout(500);

    // 확인 다이얼로그 - "로그아웃" 버튼 클릭
    await page.locator('div.dialog button').getByText('로그아웃').click();

    await page.waitForTimeout(1000);
    console.log(`${tag} [로그아웃] 로그아웃 성공!`);

    // 캐시 비우고 로그인 페이지 새로고침
    await page.context().clearCookies();
    await page.context().clearPermissions();
    await page.goto(selectors.login.pageUrl, {
      waitUntil: 'networkidle',
      timeout: config.NAVIGATION_TIMEOUT,
    });
    await page.reload({ waitUntil: 'networkidle' });
    console.log(`${tag} [로그아웃] 캐시 비우기 + 로그인 페이지 새로고침 완료`);

  } catch (error) {
    console.error(`${tag} [로그아웃 실패] ${error.message}`);
    await page.context().clearCookies();
    await page.goto(selectors.login.pageUrl, {
      waitUntil: 'networkidle',
      timeout: config.NAVIGATION_TIMEOUT,
    }).catch(() => {});
    console.log(`${tag} [로그아웃] 쿠키 삭제 + 로그인 페이지 이동 완료`);
  }
}

module.exports = { login, logout };
