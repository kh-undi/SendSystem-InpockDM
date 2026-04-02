const config = require('../config');
const selectors = require('./selectors');

/**
 * 인포크 제안서 발송
 *
 * 흐름:
 *   1. 인플루언서 인포크 링크 → 제안 버튼 클릭
 *   2. 제안서 폼 작성 (이미지, 캠페인유형, 브랜드명, 제품명, 카테고리, USP, 제안내용)
 *   3. 제안서 생성 버튼 클릭
 */
async function sendProposal(page, influencer, product, dryRun = false, accountName = '') {
  const label = `[${accountName}] [제안서] ${influencer.nickname}`;
  console.log(`${label} 발송 시작 → ${influencer.profileUrl}`);

  try {
    // URL에 https:// 없으면 자동 추가
    let url = influencer.profileUrl;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // ── 1-1단계: 페이지 이동 ──
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: config.NAVIGATION_TIMEOUT,
    });

    // ── 1-2단계: 제안 버튼 확인 & 클릭 + 새창 잡기 ──
    const proposalBtn = await page.$(selectors.proposal.sendProposalButton);
    if (!proposalBtn) {
      console.warn(`${label} 제안 버튼이 없음 - 건너뜀`);
      return { success: false, error: '제안 버튼이 페이지에 없음' };
    }

    const [newPage] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 15000 }),
      proposalBtn.click(),
    ]);

    console.log(`${label} 제안 버튼 클릭 완료`);

    // ── 1-3단계: 새 창 처리 ──
    await newPage.waitForLoadState('networkidle');
    console.log(`${label} 새 창 열림: ${newPage.url()}`);

    // "제안 보내기" 버튼이 있으면 클릭, 없으면 바로 폼 단계로 진행
    const sendBtn = newPage.locator('button:has-text("제안 보내기")');
    try {
      await sendBtn.waitFor({ state: 'visible', timeout: 5000 });
      await sendBtn.click();
      console.log(`${label} 제안 보내기 버튼 클릭 완료`);
    } catch {
      console.log(`${label} 제안 보내기 버튼 없음 - 바로 폼 단계로 진행`);
    }

    // 이후 모든 작업은 새 창(newPage)에서 진행
    await newPage.waitForTimeout(2000);

    // ── 2-1: 이미지 첨부 ──
    if (product.photos && product.photos.length > 0) {
      let fileInput = await newPage.$('div[type="campaign"] input[type="file"]');
      if (!fileInput) {
        fileInput = await newPage.$('input[type="file"]');
      }
      if (fileInput) {
        await fileInput.setInputFiles(product.photos);
        console.log(`${label} 이미지 ${product.photos.length}장 업로드`);
        await newPage.waitForTimeout(1500);

        // "선택" 버튼 클릭
        const selectBtn = newPage.locator('button:has-text("선택")');
        await selectBtn.waitFor({ state: 'visible', timeout: 5000 });
        await selectBtn.click();
        console.log(`${label} 이미지 선택 버튼 클릭 완료`);
        await newPage.waitForTimeout(1000);
      } else {
        console.warn(`${label} 이미지 업로드 input을 찾을 수 없음 - 건너뜀`);
      }
    }

    // ── 2-2: 캠페인 유형 선택 (공동구매 등) ──
    try {
      const campaignBtns = await newPage.$$('div.css-gidkuk button.css-g910fx');
      for (const btn of campaignBtns) {
        const text = await btn.textContent();
        if (text.includes(product.campaignType)) {
          await btn.click();
          console.log(`${label} 캠페인 유형: ${product.campaignType}`);
          break;
        }
      }
    } catch (e) {
      console.warn(`${label} 캠페인 유형 선택 실패:`, e.message);
    }
    await newPage.waitForTimeout(500);

    // ── 2-3: 브랜드명 ──
    await newPage.waitForSelector(selectors.proposal.brandNameInput, { timeout: 5000 });
    await newPage.fill(selectors.proposal.brandNameInput, product.brandName);
    console.log(`${label} 브랜드명: ${product.brandName}`);

    // ── 2-4: 제품명 ──
    await newPage.fill(selectors.proposal.productNameInput, product.productName);
    console.log(`${label} 제품명: ${product.productName}`);

    // ── 2-5: 카테고리 선택 (육아·키즈 등) ──
    try {
      const catButtons = await newPage.$$('div.css-1svfnxh button.css-g910fx');
      for (const btn of catButtons) {
        const text = await btn.textContent();
        if (text.includes(product.category)) {
          await btn.click();
          console.log(`${label} 카테고리: ${product.category}`);
          break;
        }
      }
    } catch (e) {
      console.warn(`${label} 카테고리 선택 실패:`, e.message);
    }
    await newPage.waitForTimeout(500);

    // ── 2-6: 제품 특징 (USP) ──
    await newPage.fill(selectors.proposal.uspTextarea, product.usp);
    console.log(`${label} USP 입력 완료`);

    // ── 2-7: 제안 내용 ──
    await newPage.fill(selectors.proposal.offerMessageTextarea, product.offerMessage);
    console.log(`${label} 제안 내용 입력 완료`);

    // ── 3: 제안서 생성 버튼 클릭 ──
    if (dryRun) {
      console.log(`${label} [DRY-RUN] 제출 건너뜀`);
    } else {
      // disabled 속성이 해제될 때까지 대기
      await newPage.waitForFunction(() => {
        const btn = document.querySelector(
          'button.inpock-button.size-xlarge.type-primary.full-width'
        );
        return btn && !btn.disabled;
      }, { timeout: 10000 });

      await newPage.click(selectors.proposal.submitButton);
      console.log(`${label} 제안서 생성 버튼 클릭`);

      // 제출 완료 대기
      await newPage.waitForTimeout(3000);
    }

    // 성공 스크린샷
    const screenshotPath = `${config.PATHS.screenshots}/sent_${influencer.nickname}_${Date.now()}.png`;
    await newPage.screenshot({ path: screenshotPath }).catch(() => {});

    // 새 창 닫기
    await newPage.close();

    console.log(`${label} 발송 성공!`);
    return { success: true };
  } catch (error) {
    console.error(`${label} 발송 실패:`, error.message);

    const screenshotPath = `${config.PATHS.screenshots}/fail_${influencer.nickname}_${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

    return { success: false, error: error.message };
  }
}

module.exports = { sendProposal };
