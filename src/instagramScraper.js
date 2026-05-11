// [요청] 인스타그램 URL → 평균 릴스 통계 조회 (부가기능)
// 모듈 레벨 currentJob 싱글톤 — 동시에 1건만 실행. server.js가 inline 호출.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const selectors = require('./instagramSelectors');

const SETTINGS_PATH = path.resolve(__dirname, '..', 'settings.json');
// [요청] 로그인 세션 안정화 — launchPersistentContext용 프로필 디렉토리.
// 쿠키/localStorage/IndexedDB/서비스워커까지 전부 보존돼서 storageState 파일보다 안정적.
const PROFILE_DIR = path.resolve(__dirname, '..', '.instagram-profile');

let currentJob = null;

function readInstagramCreds() {
  try {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    return settings.instagram || {};
  } catch { return {}; }
}

function getStatus() {
  return currentJob;
}

function isRunning() {
  return !!(currentJob && currentJob.status === 'running');
}

function parseUsername(input) {
  let u = String(input || '').trim();
  if (!u) return null;
  // username 단독 입력 (예: "cristiano" 또는 "@cristiano")
  if (!/[/.]/.test(u)) {
    u = u.replace(/^@/, '');
    return /^[A-Za-z0-9._]+$/.test(u) ? u : null;
  }
  try {
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    const parsed = new URL(u);
    if (!parsed.hostname.includes('instagram.com')) return null;
    const seg = parsed.pathname.split('/').filter(Boolean)[0];
    if (!seg) return null;
    if (['reels', 'reel', 'p', 'explore', 'accounts'].includes(seg.toLowerCase())) return null;
    return seg;
  } catch { return null; }
}

// "1.2K", "1.2만", "1,234" 등을 정수로 정규화
function parseAbbreviatedNumber(text) {
  if (text == null) return null;
  const cleaned = String(text).replace(/[\s,]/g, '').trim();
  if (!cleaned) return null;
  // 한국어 약어
  const koMatch = cleaned.match(/^([\d.]+)(만|억|천)$/);
  if (koMatch) {
    const n = parseFloat(koMatch[1]);
    const unit = koMatch[2];
    if (unit === '만') return Math.round(n * 10000);
    if (unit === '억') return Math.round(n * 100000000);
    if (unit === '천') return Math.round(n * 1000);
  }
  // 영문 약어
  const enMatch = cleaned.match(/^([\d.]+)([KkMmBb])$/);
  if (enMatch) {
    const n = parseFloat(enMatch[1]);
    const unit = enMatch[2].toLowerCase();
    if (unit === 'k') return Math.round(n * 1000);
    if (unit === 'm') return Math.round(n * 1000000);
    if (unit === 'b') return Math.round(n * 1000000000);
  }
  // 순수 숫자
  const pure = cleaned.match(/^[\d.]+$/);
  if (pure) return Math.round(parseFloat(cleaned));
  return null;
}

function avg(arr) {
  if (!arr.length) return null;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function log(msg) {
  if (currentJob) {
    const line = `[${new Date().toLocaleTimeString('ko-KR', { hour12: false })}] ${msg}`;
    currentJob.logs.push(line);
    if (currentJob.logs.length > 300) currentJob.logs.shift();
  }
  console.log('[insta]', msg);
}

function setStep(step, progress = null) {
  if (!currentJob) return;
  currentJob.currentStep = step;
  if (progress != null) currentJob.progress = progress;
  log(step);
}

async function dismissPostLoginModals(page) {
  for (const text of selectors.login.notNowButtonTexts) {
    try {
      const btn = page.locator(`button:has-text("${text}")`).first();
      if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(800);
      }
    } catch {}
  }
}

async function login(page, creds) {
  setStep('인스타 로그인 중...');
  await page.goto(selectors.login.pageUrl, { waitUntil: 'networkidle', timeout: config.NAVIGATION_TIMEOUT });
  await page.waitForSelector(selectors.login.usernameInput, { timeout: 10000 });
  await page.fill(selectors.login.usernameInput, creds.username);
  await page.fill(selectors.login.passwordInput, creds.password);
  await page.waitForTimeout(500);
  await page.click(selectors.login.submitButton);
  await page.waitForLoadState('networkidle', { timeout: config.NAVIGATION_TIMEOUT }).catch(() => {});
  await page.waitForTimeout(3000);
  // 로그인 후 모달들 (정보 저장? / 알림 설정?)
  await dismissPostLoginModals(page);
  await dismissPostLoginModals(page);
  // 로그인 페이지에 머물러있으면 실패
  if (page.url().includes('/accounts/login') || page.url().includes('/challenge')) {
    throw new Error('인스타 로그인 실패 — ID/비번 확인 또는 챌린지(2FA/캡차) 발생');
  }
}

// 릴스 그리드에서 카드 앵커들의 href와 그 카드 내 모든 텍스트 노드를 수집.
// 카드 안 텍스트 중 숫자 패턴이 있으면 가장 큰 값을 조회수로 채택(좋아요 등 다른 작은 숫자 배제용).
async function collectGridCards(page, want) {
  // N개 채울 때까지 스크롤 (max 시도 횟수 제한)
  const maxScrolls = 8;
  for (let i = 0; i < maxScrolls; i++) {
    const links = await page.locator(selectors.profile.reelCard).count();
    if (links >= want) break;
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(1200);
  }
  // 카드 정보 추출
  const cards = await page.evaluate((sel) => {
    const anchors = Array.from(document.querySelectorAll(sel));
    const seen = new Set();
    const out = [];
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      if (!href.includes('/reel/')) continue;
      // 동일 reel 중복 제거
      const m = href.match(/\/reel\/([^/?#]+)/);
      const key = m ? m[1] : href;
      if (seen.has(key)) continue;
      seen.add(key);
      // 카드 내부 텍스트 전체 모음 (조회수 후보)
      const texts = [];
      a.querySelectorAll('span').forEach(s => {
        const t = (s.textContent || '').trim();
        if (t && t.length <= 20) texts.push(t);
      });
      out.push({
        href: href.startsWith('http') ? href : `https://www.instagram.com${href}`,
        shortcode: key,
        spanTexts: texts,
      });
    }
    return out;
  }, selectors.profile.reelCard);
  return cards;
}

// 카드의 spanTexts에서 숫자 후보를 모두 파싱해 가장 큰 값을 조회수로 추정
function pickViewCountFromCard(card) {
  const candidates = [];
  for (const t of card.spanTexts) {
    const n = parseAbbreviatedNumber(t);
    if (n != null && n > 0) candidates.push(n);
  }
  if (!candidates.length) return null;
  return Math.max(...candidates);
}

// 단일 릴스 페이지에서 likes/comments 추출
async function fetchSingleReelStats(page, reelUrl) {
  const out = { views: null, likes: null, comments: null };
  await page.goto(reelUrl, { waitUntil: 'networkidle', timeout: config.NAVIGATION_TIMEOUT });
  await page.waitForTimeout(1500);

  // 전략 1: og:description 메타 — 가장 안정적
  try {
    const ogDesc = await page.getAttribute(selectors.reel.ogDescription, 'content', { timeout: 3000 }).catch(() => null);
    if (ogDesc) {
      const likeMatch = ogDesc.match(/([\d,.]+\s*[KkMmBb만억천]?)\s*(?:likes?|좋아요)/i);
      const commentMatch = ogDesc.match(/([\d,.]+\s*[KkMmBb만억천]?)\s*(?:comments?|댓글)/i);
      if (likeMatch) out.likes = parseAbbreviatedNumber(likeMatch[1]);
      if (commentMatch) out.comments = parseAbbreviatedNumber(commentMatch[1]);
    }
  } catch {}

  // 전략 2: DOM 기반 — section 안 텍스트 스캔 (좋아요/댓글 위치)
  if (out.likes == null || out.comments == null) {
    try {
      const text = await page.evaluate(() => {
        return document.querySelector('main')?.innerText || '';
      });
      if (text) {
        if (out.likes == null) {
          const m = text.match(/좋아요\s*([\d,.]+\s*[KkMmBb만억천]?)\s*개|([\d,.]+\s*[KkMmBb만억천]?)\s*likes?/i);
          if (m) out.likes = parseAbbreviatedNumber(m[1] || m[2]);
        }
        if (out.comments == null) {
          const m = text.match(/댓글\s*([\d,.]+\s*[KkMmBb만억천]?)\s*개|([\d,.]+\s*[KkMmBb만억천]?)\s*comments?/i);
          if (m) out.comments = parseAbbreviatedNumber(m[1] || m[2]);
        }
        const vm = text.match(/조회수?\s*([\d,.]+\s*[KkMmBb만억천]?)|([\d,.]+\s*[KkMmBb만억천]?)\s*views?|재생\s*([\d,.]+\s*[KkMmBb만억천]?)/i);
        if (vm) out.views = parseAbbreviatedNumber(vm[1] || vm[2] || vm[3]);
      }
    } catch {}
  }

  return out;
}

async function ensureLoggedIn(page, creds) {
  // 메인으로 가서 로그인 상태 검증 — persistent profile 디렉토리에 세션이 살아있으면 그대로 통과
  try {
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle', timeout: 15000 });
  } catch {}
  if (page.url().includes('/accounts/login')) {
    await login(page, creds);
  } else {
    log('캐시된 로그인 세션 재사용');
  }
}

async function runAnalysis(creds, mode, count) {
  // [요청] 로그인 세션 안정화 — launchPersistentContext로 디렉토리 단위 세션 보존.
  // 쿠키 로테이션·localStorage·IndexedDB 전부 자동으로 디스크에 동기화됨.
  let context = null;
  try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: config.HEADLESS,
      slowMo: config.SLOW_MO,
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      locale: 'ko-KR',
    });
    // launchPersistentContext는 기본 페이지 1개를 자동으로 열어줌 — 그것을 재사용
    const page = context.pages()[0] || await context.newPage();
    page.setDefaultTimeout(config.NAVIGATION_TIMEOUT);

    await ensureLoggedIn(page, creds);

    setStep(`프로필 진입: @${currentJob.targetUsername}`);
    const reelsUrl = selectors.profile.reelsTabUrl(currentJob.targetUsername);
    await page.goto(reelsUrl, { waitUntil: 'networkidle', timeout: config.NAVIGATION_TIMEOUT });
    await page.waitForTimeout(3000);

    // 비공개 계정 체크
    const bodyText = await page.evaluate(() => document.body.innerText || '');
    if (selectors.profile.privateTexts.some(t => bodyText.includes(t))) {
      throw new Error('비공개 계정 — 데이터를 가져올 수 없습니다.');
    }

    setStep('릴스 카드 로딩 중...');
    const cards = await collectGridCards(page, count);
    if (cards.length === 0) {
      throw new Error('릴스를 찾을 수 없습니다 (계정에 릴스가 없거나 셀렉터 변경)');
    }
    const targetCards = cards.slice(0, count);
    log(`릴스 카드 ${cards.length}개 발견 → ${targetCards.length}개 사용`);
    if (currentJob) currentJob.total = targetCards.length;

    if (mode === 'views') {
      // 모드 A: 그리드에서 조회수만 파싱
      setStep('조회수 추출 중...', 0);
      let i = 0;
      for (const card of targetCards) {
        i++;
        const v = pickViewCountFromCard(card);
        if (v != null) currentJob.partial.views.push(v);
        currentJob.progress = i;
      }
      log(`조회수 수집: ${currentJob.partial.views.length}/${targetCards.length}`);
    } else {
      // 모드 B: 카드 1개씩 상세 진입
      let i = 0;
      for (const card of targetCards) {
        i++;
        setStep(`릴스 ${i}/${targetCards.length} 상세 진입`, i - 1);
        // 그리드에서 추출한 조회수 폴백
        const gridView = pickViewCountFromCard(card);
        try {
          const stats = await fetchSingleReelStats(page, card.href);
          const useView = stats.views != null ? stats.views : gridView;
          if (useView != null) currentJob.partial.views.push(useView);
          if (stats.likes != null) currentJob.partial.likes.push(stats.likes);
          if (stats.comments != null) currentJob.partial.comments.push(stats.comments);
          log(`  → views=${useView ?? '?'} likes=${stats.likes ?? '?'} comments=${stats.comments ?? '?'}`);
        } catch (e) {
          log(`  → 실패: ${e.message}`);
        }
        currentJob.progress = i;
      }
    }

    const result = {
      mode,
      profileUrl: currentJob.profileUrl,
      targetUsername: currentJob.targetUsername,
      sampleCount: currentJob.partial.views.length,
      avgViews: avg(currentJob.partial.views),
      sampledAt: new Date().toISOString(),
    };
    if (mode === 'full') {
      result.avgLikes = avg(currentJob.partial.likes);
      result.avgComments = avg(currentJob.partial.comments);
      result.likesSampleCount = currentJob.partial.likes.length;
      result.commentsSampleCount = currentJob.partial.comments.length;
    }
    currentJob.result = result;
    currentJob.status = 'done';
    currentJob.currentStep = '완료';
    currentJob.finishedAt = new Date().toISOString();
    log(`완료: avgViews=${result.avgViews ?? 'N/A'}` +
        (mode === 'full' ? `, avgLikes=${result.avgLikes ?? 'N/A'}, avgComments=${result.avgComments ?? 'N/A'}` : ''));
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

// 진입점 — server.js가 호출
function startAnalysis({ profileUrl, mode, count = 20 }) {
  if (isRunning()) {
    const err = new Error('이미 실행 중인 인스타 분석이 있습니다.');
    err.code = 'ALREADY_RUNNING';
    throw err;
  }
  if (!['views', 'full'].includes(mode)) {
    throw new Error('mode는 views 또는 full이어야 합니다.');
  }
  const username = parseUsername(profileUrl);
  if (!username) {
    throw new Error('인스타그램 프로필 URL을 인식할 수 없습니다. (예: https://www.instagram.com/username/)');
  }
  const creds = readInstagramCreds();
  if (!creds.username || !creds.password) {
    throw new Error('인스타 계정 정보가 설정되어 있지 않습니다. 설정 → 인스타분석 계정에서 입력해주세요.');
  }
  currentJob = {
    mode,
    profileUrl,
    targetUsername: username,
    status: 'running',
    progress: 0,
    total: count,
    currentStep: '시작 중...',
    partial: { views: [], likes: [], comments: [] },
    result: null,
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    logs: [],
  };

  runAnalysis(creds, mode, count).catch(err => {
    currentJob.status = 'error';
    currentJob.error = err.message;
    currentJob.currentStep = `실패: ${err.message}`;
    currentJob.finishedAt = new Date().toISOString();
    log(`[FAIL] ${err.message}`);
  });

  return currentJob;
}

module.exports = {
  startAnalysis,
  getStatus,
  isRunning,
  parseUsername,
  parseAbbreviatedNumber,
};
