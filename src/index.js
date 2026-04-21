const { chromium } = require('playwright');
const config = require('../config');
const accountManager = require('./accountManager');
const { readInfluencersAuto } = require('./influencerReader');
const { login, logout } = require('./auth');
const { sendProposal } = require('./proposal');
const { logSent } = require('./logger');
const { isEmailAddress, findEmailAccount, sendMail } = require('./emailSender');
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const EMAIL_ACCOUNT_ID = process.env.EMAIL_ACCOUNT_ID;

async function main() {
  console.log('========================================');
  console.log('  인포크링크 제안서 자동 발송 매크로');
  console.log('========================================');
  if (DRY_RUN) console.log('⚠️  DRY-RUN 모드: 실제 제출하지 않습니다.\n');

  // 1. 인플루언서 목록 로드
  let influencers = readInfluencersAuto();

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

  // 3. 인플루언서를 이메일/인포크로 분리
  const emailTargets = influencers.filter(i => isEmailAddress(i.profileUrl));
  const inpockTargets = influencers.filter(i => !isEmailAddress(i.profileUrl));

  console.log(`\n[분류] 이메일: ${emailTargets.length}명 / 인포크: ${inpockTargets.length}명`);

  const failedList = [];
  let totalSent = 0;
  let totalFailed = 0;

  // [요청] 실패 건 발생 즉시 failed.json에 기록 (UI 실시간 표시용)
  const failedPath = path.join(__dirname, '..', 'failed.json');
  // 시작 시 이전 실패 목록 초기화
  fs.writeFileSync(failedPath, '[]', 'utf-8');
  function appendFailed(item) {
    failedList.push(item);
    fs.writeFileSync(failedPath, JSON.stringify(failedList, null, 2), 'utf-8');
  }

  // ── 3-1. 이메일 타겟 먼저 발송 ──
  if (emailTargets.length > 0) {
    const emailAccount = findEmailAccount(EMAIL_ACCOUNT_ID);
    if (!emailAccount) {
      console.error('[오류] 이메일 타겟이 있으나 Gmail 계정이 설정되지 않았습니다.');
      for (const t of emailTargets) {
        appendFailed({ ...t, error: 'Gmail 계정 미선택' });
        totalFailed++;
      }
    } else {
      console.log(`\n──── Gmail 발송 (${emailAccount.email}) ────`);
      for (const inf of emailTargets) {
        const product = productMap.get(inf.productName);
        if (DRY_RUN) {
          console.log(`[DRY-RUN] 메일 발송 건너뜀: ${inf.nickname} → ${inf.profileUrl}`);
          totalSent++;
          continue;
        }
        const result = await sendMail(emailAccount, inf, product);
        if (result.success) {
          totalSent++;
          logSent(`mail:${emailAccount.id}`, inf);
        } else {
          totalFailed++;
          appendFailed({ ...inf, error: result.error });
        }
        // 메일 간 약간의 간격 (Gmail 속도 제한 회피)
        await new Promise(r => setTimeout(r, 1500));
      }
    }
  }

  // ── 3-2. 인포크 타겟이 없으면 브라우저 생략 ──
  if (inpockTargets.length === 0) {
    finalize(totalSent, totalFailed, 0, [], failedList);
    return;
  }

  // 4. 계정 상태 확인
  console.log('\n[계정 상태]');
  const status = accountManager.getStatusSummary();
  for (const s of status) {
    console.log(`  계정 ${s.id} (${s.username}): ${s.sent}/${config.WEEKLY_LIMIT} 발송 (남은: ${s.remaining})`);
  }
  const totalRemaining = status.reduce((sum, s) => sum + s.remaining, 0);
  console.log(`  총 발송 가능: ${totalRemaining}건 / 처리할 인포크 인플루언서: ${inpockTargets.length}명\n`);

  if (totalRemaining === 0) {
    console.log('[완료] 이번 주 모든 계정의 발송 한도가 소진되었습니다.');
    finalize(totalSent, totalFailed, 0, inpockTargets, failedList);
    return;
  }

  // 5. 브라우저 실행
  const browser = await chromium.launch({
    headless: config.HEADLESS,
    slowMo: config.SLOW_MO,
  });
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(config.NAVIGATION_TIMEOUT);

  // 6. 메인 루프
  const queue = [...inpockTargets];
  let accountsUsed = 0;
  const loginFailedIds = new Set();

  try {
    while (queue.length > 0) {
      const account = accountManager.getAvailableAccount(loginFailedIds);
      if (!account) {
        console.log('\n[중단] 이번 주 모든 계정 한도 소진됨.');
        break;
      }

      const remaining = accountManager.getRemainingSlots(account);
      console.log(`\n──── 계정 ${account.id} 사용 (남은 슬롯: ${remaining}) ────`);

      const loggedIn = await login(page, account);
      if (!loggedIn) {
        console.log(`[건너뜀] 계정 ${account.id} 로그인 실패, 다음 계정으로...`);
        loginFailedIds.add(account.id);
        continue;
      }
      accountsUsed++;

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
          appendFailed({ ...influencer, error: result.error });
        }

        await page.waitForTimeout(config.ACTION_DELAY);
      }

      await logout(page, account.username);
    }
  } catch (error) {
    console.error('\n[치명적 오류]:', error.message);
  } finally {
    await browser.close();
  }

  finalize(totalSent, totalFailed, accountsUsed, queue, failedList);
}

function finalize(totalSent, totalFailed, accountsUsed, queue, failedList) {
  console.log('\n========================================');
  console.log('  발송 결과 요약');
  console.log('========================================');
  console.log(`  성공: ${totalSent}건`);
  console.log(`  실패: ${totalFailed}건`);
  console.log(`  미처리: ${queue.length}건`);
  console.log(`  사용 인포크 계정: ${accountsUsed}개`);
  console.log('========================================');

  // [요청] failed.json은 실패 발생 시 즉시 기록됨 (appendFailed)
  if (failedList.length > 0) {
    console.log('\n[실패 목록]');
    for (const f of failedList) {
      console.log(`  - ${f.nickname} | ${f.profileUrl} | ${f.productName} | 사유: ${f.error}`);
    }
    console.log('  → 재발송 시 실패 목록의 "재발송 등록" 버튼을 사용하세요.');
  }
}

main().catch(console.error);
