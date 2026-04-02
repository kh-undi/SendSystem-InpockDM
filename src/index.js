const { chromium } = require('playwright');
const config = require('../config');
const accountManager = require('./accountManager');
const { readInfluencersAuto, filterAlreadySent } = require('./influencerReader');
const { login, logout } = require('./auth');
const { sendProposal } = require('./proposal');
const { logSent } = require('./logger');
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log('========================================');
  console.log('  인포크링크 제안서 자동 발송 매크로');
  console.log('========================================');
  if (DRY_RUN) console.log('⚠️  DRY-RUN 모드: 실제 제출하지 않습니다.\n');

  // 1. 인플루언서 목록 로드
  let influencers = readInfluencersAuto();
  influencers = filterAlreadySent(influencers);

  if (influencers.length === 0) {
    console.log('[완료] 발송할 인플루언서가 없습니다.');
    return;
  }

  // 2. 제품 정보 로드
  const productsData = JSON.parse(fs.readFileSync(config.PATHS.products, 'utf-8'));
  const productMap = new Map(productsData.products.map(p => [p.name, p]));

  // 제품명 매칭 검증
  for (const inf of influencers) {
    if (!productMap.has(inf.productName)) {
      console.error(`[오류] "${inf.nickname}"의 제품명 "${inf.productName}"이 products.json에 없습니다.`);
      process.exit(1);
    }
  }

  // 3. 계정 상태 확인
  console.log('\n[계정 상태]');
  const status = accountManager.getStatusSummary();
  for (const s of status) {
    console.log(`  계정 ${s.id} (${s.username}): ${s.sent}/${config.WEEKLY_LIMIT} 발송 (남은: ${s.remaining})`);
  }
  const totalRemaining = status.reduce((sum, s) => sum + s.remaining, 0);
  console.log(`  총 발송 가능: ${totalRemaining}건 / 처리할 인플루언서: ${influencers.length}명\n`);

  if (totalRemaining === 0) {
    console.log('[완료] 이번 주 모든 계정의 발송 한도가 소진되었습니다.');
    return;
  }

  // 4. 브라우저 실행
  const browser = await chromium.launch({
    headless: config.HEADLESS,
    slowMo: config.SLOW_MO,
  });
  // 화면 크기를 모니터 해상도에 맞춤
  const { execSync } = require('child_process');
  let screenWidth = 1280, screenHeight = 900;
  try {
    const wmicOut = execSync('wmic path Win32_VideoController get CurrentVerticalResolution,CurrentHorizontalResolution /format:value', { encoding: 'utf-8' });
    const wMatch = wmicOut.match(/CurrentHorizontalResolution=(\d+)/);
    const hMatch = wmicOut.match(/CurrentVerticalResolution=(\d+)/);
    if (wMatch) screenWidth = parseInt(wMatch[1]);
    if (hMatch) screenHeight = parseInt(hMatch[1]);
  } catch {}

  const context = await browser.newContext({
    viewport: { width: screenWidth, height: screenHeight },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(config.NAVIGATION_TIMEOUT);

  // 5. 메인 루프
  const queue = [...influencers];
  let totalSent = 0;
  let totalFailed = 0;
  let accountsUsed = 0;
  const failedList = []; // 실패한 인플루언서 목록

  try {
    while (queue.length > 0) {
      // 사용 가능한 계정 찾기
      const account = accountManager.getAvailableAccount();
      if (!account) {
        console.log('\n[중단] 이번 주 모든 계정 한도 소진됨.');
        break;
      }

      const remaining = accountManager.getRemainingSlots(account);
      console.log(`\n──── 계정 ${account.id} 사용 (남은 슬롯: ${remaining}) ────`);

      // 로그인
      const loggedIn = await login(page, account);
      if (!loggedIn) {
        console.log(`[건너뜀] 계정 ${account.id} 로그인 실패, 다음 계정으로...`);
        // 로그인 실패한 계정은 한도를 꽉 채워서 다시 선택 안 되게 함
        for (let i = 0; i < remaining; i++) {
          accountManager.incrementSendCount(account.id);
        }
        continue;
      }
      accountsUsed++;

      // 이 계정으로 성공 카운트가 10 찰 때까지 큐에서 하나씩 처리
      let sentThisAccount = 0;
      while (queue.length > 0 && sentThisAccount < remaining) {
        const influencer = queue.shift();
        const product = productMap.get(influencer.productName);

        const result = await sendProposal(page, influencer, product, DRY_RUN, account.username);

        if (result.success) {
          sentThisAccount++;
          if (!DRY_RUN) {
            accountManager.incrementSendCount(account.id);
            logSent(account.id, influencer);
          }
          totalSent++;
          console.log(`  → 진행: ${totalSent}/${influencers.length} 완료 (이 계정: ${sentThisAccount}/${remaining})`);
        } else {
          totalFailed++;
          failedList.push({ ...influencer, error: result.error });
        }

        // 발송 사이 대기
        await page.waitForTimeout(config.ACTION_DELAY);
      }

      // 로그아웃
      await logout(page, account.username);
    }
  } catch (error) {
    console.error('\n[치명적 오류]:', error.message);
  } finally {
    await browser.close();
  }

  // 6. 결과 요약
  console.log('\n========================================');
  console.log('  발송 결과 요약');
  console.log('========================================');
  console.log(`  성공: ${totalSent}건`);
  console.log(`  실패: ${totalFailed}건`);
  console.log(`  미처리: ${queue.length}건`);
  console.log(`  사용 계정: ${accountsUsed}개`);
  console.log('========================================');

  // 실패 목록 출력 & 파일 저장
  if (failedList.length > 0) {
    console.log('\n[실패 목록]');
    for (const f of failedList) {
      console.log(`  - ${f.nickname} | ${f.profileUrl} | ${f.productName} | 사유: ${f.error}`);
    }

    // failed.json 저장 (재발송용)
    const failedPath = path.join(__dirname, '..', 'failed.json');
    fs.writeFileSync(failedPath, JSON.stringify(failedList, null, 2), 'utf-8');
    console.log(`\n[실패 목록 저장] ${failedPath}`);
    console.log('  → 재발송 시 이 목록을 인플루언서 탭에 붙여넣기 하세요.');
  }
}

main().catch(console.error);
