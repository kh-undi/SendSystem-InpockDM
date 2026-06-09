const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cron = require('node-cron');
const config = require('./config');
const accountManager = require('./src/accountManager');

const app = express();
// [요청] 외부 배포 — PORT를 env로 지원 (기본 3000)
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));

// [요청] 외부 배포 — 세션 기반 비밀번호 인증
//   - settings.adminPassword가 비어있으면 auth 비활성 (로컬 전용 운영 시)
//   - 값이 있으면 /login 통과 전까지 모든 경로 차단
const SETTINGS_PATH_SRV = path.join(__dirname, 'settings.json');
function readSettingsSrv() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH_SRV, 'utf-8')); }
  catch { return {}; }
}
// session secret: settings.json의 값이 없으면 프로세스 시작 시 1회 랜덤 생성
// (재시작 시 세션 무효화되어 모든 사용자 재로그인 필요 — 의도된 동작)
const SESSION_SECRET = readSettingsSrv().sessionSecret || crypto.randomBytes(32).toString('hex');
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
  },
}));

function authRequired(req, res, next) {
  // [요청] Vercel 직원용 배포 — 서버리스(process.env.VERCEL)에선 인증 스킵.
  //   직원은 링크만으로 바로 이용. 세션이 무상태 환경에서 안 살아남는 문제도 회피.
  //   ⚠️ Vercel URL을 아는 사람은 누구나 접근 가능(공개 인터넷). 권한 분리는 후속 작업(메모 참조).
  if (process.env.VERCEL) return next();
  const password = readSettingsSrv().adminPassword;
  if (!password) return next();                     // 비번 미설정 → auth 비활성
  if (req.path === '/favicon.ico') return next();   // favicon은 인증 없이 허용 (로그인 페이지 탭 아이콘)
  if (req.path.startsWith('/recommend')) return next(); // [요청] 추천 카탈로그 공개 페이지 — 링크만 있으면 인증 없이 열람
  if (req.session && req.session.authenticated) return next();
  // API 호출은 401, 그 외는 /login으로 리다이렉트
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'auth_required' });
  }
  return res.redirect('/login');
}

// 인증 없이 접근 가능: 로그인 페이지·로그인 API·정적 로그인 리소스
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  const expected = readSettingsSrv().adminPassword;
  if (!expected) {                                  // 비번 미설정 — 누구든 통과
    req.session.authenticated = true;
    return res.json({ ok: true });
  }
  if (password && password === expected) {
    req.session.authenticated = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'invalid_password' });
});
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});
app.get('/api/auth/status', (req, res) => {
  const needsAuth = !!readSettingsSrv().adminPassword;
  res.json({
    needsAuth,
    authenticated: !needsAuth || !!(req.session && req.session.authenticated),
  });
});

// 이하 모든 라우트는 인증 미들웨어 뒤
app.use(authRequired);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// 이미지 업로드 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'assets');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  },
});
const upload = multer({ storage });

// ─── 설정 API ─── [요청] 참조자 이메일 등 런타임 설정
const SETTINGS_PATH = path.join(__dirname, 'settings.json');
function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')); }
  catch { return {}; }
}
function writeSettings(data) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

app.get('/api/settings', (req, res) => {
  res.json(readSettings());
});

app.put('/api/settings', (req, res) => {
  const current = readSettings();
  const updated = { ...current, ...req.body };
  writeSettings(updated);
  res.json(updated);
});

// ─── 계정 API ───
// [요청] accountsRepo 경유로 변경 — USE_SUPABASE 플래그에 따라 JSON/Supabase 자동 분기
const accountsRepo = require('./src/repo/accountsRepo');

app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await accountsRepo.list();
    const weekKey = accountManager.getCurrentWeekKey();
    const result = accounts.map(acc => ({
      ...acc,
      sent: (acc.weeklyTracking && acc.weeklyTracking[weekKey]) || 0,
      remaining: config.WEEKLY_LIMIT - ((acc.weeklyTracking && acc.weeklyTracking[weekKey]) || 0),
      week: weekKey,
    }));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/accounts', async (req, res) => {
  try {
    await accountsRepo.replaceAll(req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/accounts/reset', async (req, res) => {
  try {
    await accountsRepo.resetAllWeeklyTracking();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// [요청] 주간 카운트 강제 증감 — 수동 발송 보정용
app.post('/api/accounts/:id/adjust-week', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const delta = parseInt(req.body && req.body.delta, 10);
    if (!Number.isFinite(id) || !Number.isFinite(delta) || (delta !== 1 && delta !== -1)) {
      return res.status(400).json({ error: 'id 및 delta(±1) 필요' });
    }
    const newCount = await accountManager.adjustSendCount(id, delta);
    res.json({ ok: true, count: newCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── 이메일 계정 API (Gmail) ───
// [요청] emailAccountsRepo 경유로 변경 — USE_SUPABASE 플래그에 따라 JSON/Supabase 자동 분기
const emailAccountsRepo = require('./src/repo/emailAccountsRepo');

app.get('/api/emailAccounts', async (req, res) => {
  try {
    res.json(await emailAccountsRepo.list());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/emailAccounts', async (req, res) => {
  try {
    await emailAccountsRepo.replaceAll(req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/emailAccounts/verify', async (req, res) => {
  const { id } = req.body || {};
  const { findEmailAccount, verifyTransport } = require('./src/emailSender');
  const acc = await findEmailAccount(id);
  if (!acc) return res.status(404).json({ error: '이메일 계정을 찾을 수 없습니다.' });
  try {
    await verifyTransport(acc);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ─── 제품 API ───
// [요청] productsRepo 경유로 변경 — USE_SUPABASE 플래그에 따라 JSON/Supabase 자동 분기
const productsRepo = require('./src/repo/productsRepo');

app.get('/api/products', async (req, res) => {
  try {
    const products = await productsRepo.list();
    res.json(products);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/products', async (req, res) => {
  try {
    await productsRepo.replaceAll(req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// [요청] 카드 단위 저장 — 정통 신규 추가(풀 페이로드). "+ 제품 추가"로 만든 신규 stub의 첫 저장 시 호출.
const REQUIRED_PRODUCT_FIELDS = [
  ['name', '관리명'],
  ['brandName', '브랜드명'],
  ['productName', '제품명'],
  ['category', '카테고리'],
  ['campaignType', '캠페인 유형'],
];
function validateProductBody(body) {
  for (const [key, label] of REQUIRED_PRODUCT_FIELDS) {
    if (!String(body?.[key] || '').trim()) {
      return `'${label}' 항목이 비어있습니다.`;
    }
  }
  return null;
}

app.post('/api/products', async (req, res) => {
  try {
    const errMsg = validateProductBody(req.body);
    if (errMsg) return res.status(400).json({ error: errMsg });
    const created = await productsRepo.insertOne(req.body);
    res.json({ ok: true, product: created });
  } catch (e) {
    if (e.code === 'DUPLICATE_NAME') {
      return res.status(409).json({ error: '이미 같은 관리명의 제품이 존재합니다.' });
    }
    res.status(500).json({ error: e.message });
  }
});

// [요청] 카드 단위 저장 — 단건 update.
app.put('/api/products/:id', async (req, res) => {
  try {
    const errMsg = validateProductBody(req.body);
    if (errMsg) return res.status(400).json({ error: errMsg });
    const updated = await productsRepo.updateOne(req.params.id, req.body);
    res.json({ ok: true, product: updated });
  } catch (e) {
    if (e.code === 'DUPLICATE_NAME') {
      return res.status(409).json({ error: '이미 같은 관리명의 제품이 존재합니다.' });
    }
    if (e.code === 'NOT_FOUND') {
      return res.status(404).json({ error: '해당 제품을 찾을 수 없습니다.' });
    }
    res.status(500).json({ error: e.message });
  }
});

// [요청] 카드 단위 저장 — 단건 삭제.
app.delete('/api/products/:id', async (req, res) => {
  try {
    await productsRepo.removeOne(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// [요청] 빠른 제품 추가 — 브랜드명/제품명만으로 단건 insert. 관리명=제품명.
app.post('/api/products/quick', async (req, res) => {
  try {
    const brandName = String(req.body?.brandName || '').trim();
    const productName = String(req.body?.productName || '').trim();
    if (!brandName || !productName) {
      return res.status(400).json({ error: '브랜드명과 제품명은 필수입니다.' });
    }
    const created = await productsRepo.insertOne({
      name: productName,
      brandName,
      productName,
      campaignType: '공동구매',
      category: '육아·키즈',
      hookingPhrases: [],
    });
    res.json({ ok: true, product: created });
  } catch (e) {
    if (e.code === 'DUPLICATE_NAME') {
      return res.status(409).json({ error: '이미 같은 관리명의 제품이 존재합니다.' });
    }
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/products/upload', upload.array('photos', 10), async (req, res) => {
  try {
    const files = [];
    for (const f of req.files) {
      // multer가 저장한 로컬 경로를 repo에 전달:
      //  - JSON 모드: 로컬 경로 반환 (기존 동작)
      //  - Supabase 모드: Storage 업로드 후 public URL 반환
      const url = await productsRepo.uploadPhoto(f.path);
      files.push(url);
    }
    res.json({ files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── 인플루언서 API ───
// [요청] influencersRepo 경유로 변경 — USE_SUPABASE 플래그에 따라 JSON/Supabase 자동 분기
const influencersRepo = require('./src/repo/influencersRepo');

app.get('/api/influencers', async (req, res) => {
  try {
    const list = await influencersRepo.listPending();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/influencers', async (req, res) => {
  try {
    await influencersRepo.replaceAllPending(req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── 발송 로그 API ───
// [요청] sentLogRepo 경유로 변경 — USE_SUPABASE 플래그에 따라 JSON/Supabase 자동 분기
const sentLogRepo = require('./src/repo/sentLogRepo');

app.get('/api/logs', async (req, res) => {
  try {
    res.json(await sentLogRepo.list());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── 실패 목록 API ───
// [요청] influencersRepo 경유로 변경 — USE_SUPABASE 플래그에 따라 JSON/Supabase 자동 분기
app.get('/api/failed', async (req, res) => {
  try {
    res.json(await influencersRepo.listFailed());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/failed', async (req, res) => {
  try {
    await influencersRepo.clearFailed();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/failed/retry', async (req, res) => {
  try {
    const list = await influencersRepo.listFailed();
    if (!list.length) return res.status(400).json({ error: '실패 목록이 없습니다.' });
    const result = await influencersRepo.requeueFailed();
    res.json({ ok: true, added: result.added });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// [요청] 발송 중 크래시 대비 — sending 상태 확인/해결 API
// [요청] 확인필요 카드 — in-flight sending row 오표시 수정
//   매크로 실행 중에는 staleSeconds=120 전달해 최근 2분 이내 update된 row(정상 처리 중)는 제외.
//   미실행이면 0 → 모든 sending row 노출 (진짜 stuck).
app.get('/api/influencers/sending', async (req, res) => {
  try {
    const staleSeconds = macroProcess ? 120 : 0;
    res.json(await influencersRepo.listSending(staleSeconds));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/influencers/:id/resolve', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
    const { action } = req.body || {};
    if (action === 'sent') {
      await influencersRepo.resolveSendingAsSent(id);
    } else if (action === 'requeue') {
      await influencersRepo.resolveSendingAsPending(id);
    } else {
      return res.status(400).json({ error: 'action은 sent 또는 requeue여야 합니다.' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── 인스타그램 릴스 통계 API ───
// [요청] 인스타그램 URL → 평균 릴스 통계 조회 (부가기능)
// [요청] Vercel 직원용 배포 — instagramScraper가 top-level로 require('playwright')를 하므로,
//   여기서 top-level require하면 서버리스 함수가 로드되는 순간 playwright를 끌어와 크래시(FUNCTION_INVOCATION_FAILED).
//   직원 CRUD엔 인스타 기능이 필요 없으니, 실제 호출 시점에만 lazy require한다.
//   ngrok/로컬: 호출 시 정상 로드(require 캐싱)되어 동작 동일. Vercel: 호출 안 하면 playwright 미로딩.
let _instagramScraper = null;
function getInstagramScraper() {
  if (!_instagramScraper) _instagramScraper = require('./src/instagramScraper');
  return _instagramScraper;
}

app.post('/api/instagram/analyze', (req, res) => {
  try {
    const { profileUrl, mode } = req.body || {};
    const job = getInstagramScraper().startAnalysis({ profileUrl, mode, count: 20 });
    res.json({ ok: true, job });
  } catch (e) {
    if (e.code === 'ALREADY_RUNNING') return res.status(409).json({ error: e.message });
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/instagram/status', (req, res) => {
  res.json(getInstagramScraper().getStatus() || { status: 'idle' });
});

// ─── 매크로 실행 API ───
let macroProcess = null;
let macroLogs = [];

// [요청] 로그 무한 증가로 인한 메모리 누수 방지 — macroLogs/replyLogs를 최근 N줄만 유지.
//   기존엔 발송/답장확인 stdout이 상시 떠있는 server 프로세스 힙에 무제한 누적됐고,
//   /api/macro|replies/status 폴링마다 배열 전체를 JSON 직렬화해 메모리·CPU가 동반 상승했음.
//   leadsLogs(200)·instagramScraper(300) 패턴과 동일하게 상한을 둔다.
const MAX_LOG_LINES = 500;
function pushMacroLog(...items) {
  macroLogs.push(...items);
  if (macroLogs.length > MAX_LOG_LINES) macroLogs = macroLogs.slice(-MAX_LOG_LINES);
}
function pushReplyLog(...items) {
  replyLogs.push(...items);
  if (replyLogs.length > MAX_LOG_LINES) replyLogs = replyLogs.slice(-MAX_LOG_LINES);
}

// [요청] 고아 크롬 프로세스 누적 방지 — 자식 프로세스를 "트리 전체"로 강제 종료.
//   Windows의 child.kill()은 TerminateProcess로 변환돼 node 자식만 죽이고,
//   그 node가 띄운 Playwright chromium(chrome.exe) 손자들은 고아로 남는다.
//   고아 chrome이 누적되면 RAM/CPU를 점유 → 시스템 프리징/발열 셧다운의 주원인.
//   또한 강제 종료 시 자식 스크립트의 finally{ browser.close() }가 실행되지 않으므로
//   반드시 트리 단위로 죽여야 한다. → taskkill /T(자식 트리) /F(강제).
function killProcessTree(proc, signal = 'SIGTERM') {
  if (!proc || proc.pid == null) return;
  if (process.platform === 'win32') {
    try {
      const { spawn } = require('child_process');
      // detached + 출력 무시로 좀비 핸들 남기지 않음
      const tk = spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      tk.on('error', () => { try { proc.kill('SIGKILL'); } catch {} });
    } catch {
      try { proc.kill('SIGKILL'); } catch {}
    }
  } else {
    try { proc.kill(signal); } catch {}
  }
}

app.post('/api/macro/start', async (req, res) => {
  if (macroProcess) return res.status(400).json({ error: '이미 실행 중입니다.' });

  // [요청] 메일만 발송 옵션 — mailOnly 수신하여 자식 env로 전달
  const { dryRun, emailAccountId, mailOnly } = req.body || {};

  // [요청] influencersRepo 경유로 변경 — USE_SUPABASE 플래그 존중
  const influencers = await influencersRepo.listPending();

  if (influencers.length === 0) {
    return res.status(400).json({ error: '발송할 인플루언서가 없습니다.' });
  }

  // 이메일 타겟이 있는데 이메일 계정이 지정/존재하지 않으면 중단
  const hasEmailTarget = influencers.some(i => (i.profileUrl || '').includes('@'));
  if (hasEmailTarget) {
    const { findEmailAccount } = require('./src/emailSender');
    if (!await findEmailAccount(emailAccountId)) {
      return res.status(400).json({ error: '이메일 주소가 포함되어 있으나 선택된 Gmail 계정이 없습니다.' });
    }
  }

  // JSON 모드 fallback용: CSV도 갱신해둠 (child가 influencersRepo 경유로 읽지만,
  // influencers.json이 비어있고 CSV만 있는 레거시 상황 대비)
  if (!config.USE_SUPABASE) {
    const csvHeader = 'nickname,profileUrl,productName';
    const csvRows = influencers.map(i => `${i.nickname},${i.profileUrl},${i.productName}`);
    fs.writeFileSync(config.PATHS.influencers, [csvHeader, ...csvRows].join('\n'), 'utf-8');
  }

  macroLogs = [];
  const args = [path.join(__dirname, 'src/index.js')];
  if (dryRun) args.push('--dry-run');

  const { spawn } = require('child_process');
  const env = { ...process.env };
  if (emailAccountId != null && emailAccountId !== '') {
    env.EMAIL_ACCOUNT_ID = String(emailAccountId);
  }
  // [요청] 메일만 발송 옵션
  if (mailOnly) env.MAIL_ONLY = 'true';
  macroProcess = spawn('node', args, { cwd: __dirname, env });

  macroProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    pushMacroLog(...lines);
  });

  macroProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    pushMacroLog(...lines.map(l => `[ERROR] ${l}`));
  });

  macroProcess.on('close', (code) => {
    pushMacroLog(`\n[완료] 프로세스 종료 (코드: ${code})`);
    macroProcess = null;
  });

  res.json({ ok: true, message: '매크로 시작됨' });
});

app.post('/api/macro/stop', (req, res) => {
  if (!macroProcess) return res.status(400).json({ error: '실행 중인 매크로가 없습니다.' });
  // [요청] 고아 크롬 방지 — 프로세스 트리 전체 강제 종료
  killProcessTree(macroProcess);
  macroProcess = null;
  pushMacroLog('[중단] 사용자에 의해 중단됨');
  res.json({ ok: true });
});

app.get('/api/macro/status', (req, res) => {
  res.json({
    running: macroProcess !== null,
    logs: macroLogs,
  });
});

// ─── 답장 확인 API ───
let replyProcess = null;
let replyLogs = [];

app.post('/api/replies/check', (req, res) => {
  if (replyProcess) return res.status(400).json({ error: '이미 실행 중입니다.' });
  if (macroProcess) return res.status(400).json({ error: '발송 매크로가 실행 중입니다.' });

  replyLogs = [];
  const { spawn } = require('child_process');
  // [요청] startFrom 지정 시 해당 계정부터 순차 시작
  const { startFrom } = req.body || {};
  const args = [path.join(__dirname, 'src/checkReplies.js')];
  if (startFrom) args.push('--start', startFrom);
  replyProcess = spawn('node', args, { cwd: __dirname });

  replyProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    pushReplyLog(...lines);
  });
  replyProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    pushReplyLog(...lines.map(l => `[ERROR] ${l}`));
  });
  replyProcess.on('close', (code) => {
    pushReplyLog(`\n[완료] 프로세스 종료 (코드: ${code})`);
    replyProcess = null;
  });

  res.json({ ok: true });
});

app.post('/api/replies/stop', (req, res) => {
  if (!replyProcess) return res.status(400).json({ error: '실행 중이 아닙니다.' });
  const force = !!(req.body && req.body.force);
  const signal = force ? 'SIGKILL' : 'SIGTERM';
  // [요청] 고아 크롬 방지 — 프로세스 트리 전체 강제 종료 (Windows에선 force 여부와 무관히 /F)
  killProcessTree(replyProcess, signal);
  if (force) {
    replyProcess = null;
    pushReplyLog('[강제 종료] 사용자에 의해 강제 종료됨');
  } else {
    pushReplyLog('[중단] 사용자에 의해 중단됨');
  }
  res.json({ ok: true, force });
});

// [요청] repliesRepo 경유로 변경 — USE_SUPABASE 플래그에 따라 JSON/Supabase 자동 분기
const repliesRepo = require('./src/repo/repliesRepo');

app.get('/api/replies/status', async (req, res) => {
  try {
    const results = await repliesRepo.getLatest();
    res.json({ running: replyProcess !== null, logs: replyLogs, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── 리드 관리 API ───
// [요청] 리드 관리 탭 신설 (답장 온 인플루언서 추적)
const leadsRepo = require('./src/repo/leadsRepo');
let leadsLogs = [];

function pushLeadsLog(line) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  leadsLogs.push(`[${ts}] ${line}`);
  // 최근 200줄 유지
  if (leadsLogs.length > 200) leadsLogs = leadsLogs.slice(-200);
  console.log(`[리드] ${line}`);
}

app.get('/api/leads', async (req, res) => {
  try {
    res.json(await leadsRepo.list());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/leads', async (req, res) => {
  try {
    if (!String(req.body?.nickname || '').trim()) {
      return res.status(400).json({ error: '닉네임은 필수입니다.' });
    }
    const finalStatus = req.body?.finalStatus;
    if (finalStatus && !leadsRepo.ALLOWED_STATUSES.includes(finalStatus)) {
      return res.status(400).json({ error: '허용되지 않는 최종 결과 값입니다.' });
    }
    const created = await leadsRepo.insertOne(req.body);
    res.json({ ok: true, lead: created });
  } catch (e) {
    if (e.code === 'NICKNAME_REQUIRED') {
      return res.status(400).json({ error: '닉네임은 필수입니다.' });
    }
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/leads/:id', async (req, res) => {
  try {
    if (!String(req.body?.nickname || '').trim()) {
      return res.status(400).json({ error: '닉네임은 필수입니다.' });
    }
    const finalStatus = req.body?.finalStatus;
    if (finalStatus && !leadsRepo.ALLOWED_STATUSES.includes(finalStatus)) {
      return res.status(400).json({ error: '허용되지 않는 최종 결과 값입니다.' });
    }
    const updated = await leadsRepo.updateOne(req.params.id, req.body);
    res.json({ ok: true, lead: updated });
  } catch (e) {
    if (e.code === 'NICKNAME_REQUIRED') {
      return res.status(400).json({ error: '닉네임은 필수입니다.' });
    }
    if (e.code === 'NOT_FOUND') {
      return res.status(404).json({ error: '해당 리드를 찾을 수 없습니다.' });
    }
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/leads/:id', async (req, res) => {
  try {
    await leadsRepo.removeOne(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/leads/reminders-due', async (req, res) => {
  try {
    const list = await leadsRepo.listDueReminders();
    res.json({ count: list.length, leads: list, logs: leadsLogs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── 추천 카탈로그 API ───
// [요청] 추천 카탈로그 페이지 — 인플루언서별 큐레이션 공유 링크
const catalogsRepo = require('./src/repo/catalogsRepo');

app.get('/api/catalogs', async (req, res) => {
  try {
    res.json(await catalogsRepo.list());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/catalogs', async (req, res) => {
  try {
    const created = await catalogsRepo.insertOne(req.body);
    res.json({ ok: true, catalog: created });
  } catch (e) {
    if (e.code === 'NICKNAME_REQUIRED') {
      return res.status(400).json({ error: '닉네임은 필수입니다.' });
    }
    if (e.code === 'PRODUCTS_REQUIRED') {
      return res.status(400).json({ error: '제품을 1개 이상 선택해야 합니다.' });
    }
    res.status(500).json({ error: e.message });
  }
});

// [요청] 기존 카탈로그 수정 — code(공개 URL)·view_count 보존, 제품 목록·제목·닉네임·leadId만 갱신
app.put('/api/catalogs/:id', async (req, res) => {
  try {
    const updated = await catalogsRepo.updateOne(req.params.id, req.body);
    res.json({ ok: true, catalog: updated });
  } catch (e) {
    if (e.code === 'NICKNAME_REQUIRED') return res.status(400).json({ error: '닉네임은 필수입니다.' });
    if (e.code === 'PRODUCTS_REQUIRED') return res.status(400).json({ error: '제품을 1개 이상 선택해야 합니다.' });
    if (e.code === 'NOT_FOUND') return res.status(404).json({ error: '카탈로그를 찾을 수 없습니다.' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/catalogs/:id', async (req, res) => {
  try {
    await catalogsRepo.removeOne(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── 직원 / 자주 사용하는 문구 API ───
// [요청] 자주 사용하는 문구 — 직원별 추가/복사 탭 신설
const employeesRepo = require('./src/repo/employeesRepo');
const phrasesRepo = require('./src/repo/phrasesRepo');

app.get('/api/employees', async (req, res) => {
  try {
    res.json(await employeesRepo.list());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/employees', async (req, res) => {
  try {
    const created = await employeesRepo.insertOne(req.body);
    res.json({ ok: true, employee: created });
  } catch (e) {
    if (e.code === 'NAME_REQUIRED') return res.status(400).json({ error: '직원 이름은 필수입니다.' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/employees/:id', async (req, res) => {
  try {
    const updated = await employeesRepo.updateOne(req.params.id, req.body);
    res.json({ ok: true, employee: updated });
  } catch (e) {
    if (e.code === 'NAME_REQUIRED') return res.status(400).json({ error: '직원 이름은 필수입니다.' });
    if (e.code === 'NOT_FOUND') return res.status(404).json({ error: '직원을 찾을 수 없습니다.' });
    res.status(500).json({ error: e.message });
  }
});

// 직원 삭제 시 해당 직원 문구도 함께 삭제됨(Supabase on delete cascade / JSON 모드는 repo가 정리).
app.delete('/api/employees/:id', async (req, res) => {
  try {
    await employeesRepo.removeOne(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/phrases', async (req, res) => {
  try {
    res.json(await phrasesRepo.list(req.query.employeeId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/phrases', async (req, res) => {
  try {
    const created = await phrasesRepo.insertOne(req.body);
    res.json({ ok: true, phrase: created });
  } catch (e) {
    if (e.code === 'EMPLOYEE_REQUIRED') return res.status(400).json({ error: '직원을 먼저 선택해야 합니다.' });
    if (e.code === 'CONTENT_REQUIRED') return res.status(400).json({ error: '문구 내용은 필수입니다.' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/phrases/:id', async (req, res) => {
  try {
    const updated = await phrasesRepo.updateOne(req.params.id, req.body);
    res.json({ ok: true, phrase: updated });
  } catch (e) {
    if (e.code === 'CONTENT_REQUIRED') return res.status(400).json({ error: '문구 내용은 필수입니다.' });
    if (e.code === 'NOT_FOUND') return res.status(404).json({ error: '문구를 찾을 수 없습니다.' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/phrases/:id', async (req, res) => {
  try {
    await phrasesRepo.removeOne(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// [요청] 리드 관리 탭 신설 — 매일 09:00 리마인드 due 콘솔/leadsLogs 기록.
//   향후 텔레그램/이메일 푸시는 이 함수에서 1줄 추가만으로 붙일 수 있도록 분리해둠.
async function checkLeadReminders() {
  try {
    const due = await leadsRepo.listDueReminders();
    if (!due.length) {
      pushLeadsLog('리마인드 필요 없음');
      return;
    }
    pushLeadsLog(`리마인드 ${due.length}건 필요:`);
    due.forEach(l => {
      const product = l.interestedProductName ? ` (${l.interestedProductName})` : '';
      pushLeadsLog(`  - ${l.nickname}${product} · 제안서 ${l.proposalSentAt || '?'} · 리마인드 ${l.remindAt}`);
    });
  } catch (e) {
    pushLeadsLog(`리마인드 체크 실패: ${e.message}`);
  }
}

// [요청] Vercel 직원용 배포 — cron은 서버리스에서 동작하지 않으므로(인스턴스 휘발성)
//   로컬/ngrok(매크로 운영 서버)에서만 등록. spawn 기반 답장확인도 Vercel에선 불가.
if (!process.env.VERCEL) {
cron.schedule('0 9 * * *', () => {
  console.log('[크론] 리드 리마인드 체크 시작');
  checkLeadReminders();
});

// ─── 매일 오전,오후 총 5번 자동 답장확인 ───
cron.schedule('30 8,10,12,14,16 * * 1-5', () => {
  if (replyProcess || macroProcess) {
    console.log('[크론] 답장확인 건너뜀 - 다른 프로세스 실행 중');
    return;
  }
  const hour = new Date().getHours();
  console.log(`[크론] ${hour}시 자동 답장확인 시작`);
  replyLogs = [];
  const { spawn } = require('child_process');
  replyProcess = spawn('node', [path.join(__dirname, 'src/checkReplies.js')], { cwd: __dirname });

  replyProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    pushReplyLog(...lines);
  });
  replyProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    pushReplyLog(...lines.map(l => `[ERROR] ${l}`));
  });
  replyProcess.on('close', (code) => {
    pushReplyLog(`\n[완료] 프로세스 종료 (코드: ${code})`);
    replyProcess = null;
  });
});
} // [요청] Vercel 가드 끝 — cron 블록 (위 if (!process.env.VERCEL))

// [요청] 고아 크롬 방지 — 서버 종료(Ctrl+C / 재시작) 시 실행 중이던 자식 트리 정리.
//   서버가 죽으면 spawn된 매크로/답장확인 node와 그 chromium 손자들이 고아로 남으므로,
//   종료 직전에 트리 단위로 죽이고 빠져나간다. (중복 호출 방지 플래그)
let shuttingDown = false;
function shutdownCleanup() {
  if (shuttingDown) return;
  shuttingDown = true;
  killProcessTree(macroProcess);
  killProcessTree(replyProcess);
  // taskkill은 비동기 spawn이라 약간의 여유를 두고 종료
  setTimeout(() => process.exit(0), 300);
}
process.on('SIGINT', shutdownCleanup);
process.on('SIGTERM', shutdownCleanup);

// ─── 서버 시작 ───
// [요청] Vercel 직원용 배포 — 서버리스에선 app.listen 대신 Express app을 핸들러로 export.
//   @vercel/node가 module.exports를 (req,res) 핸들러로 사용. 로컬/ngrok에선 기존대로 listen.
module.exports = app;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n  인포크링크 매크로 관리 UI`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`  [크론] 매일 일일 총 4번 자동 답장확인 활성화\n`);
  });
}
