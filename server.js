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
  const password = readSettingsSrv().adminPassword;
  if (!password) return next();                     // 비번 미설정 → auth 비활성
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

// ─── 매크로 실행 API ───
let macroProcess = null;
let macroLogs = [];

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
    macroLogs.push(...lines);
  });

  macroProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    macroLogs.push(...lines.map(l => `[ERROR] ${l}`));
  });

  macroProcess.on('close', (code) => {
    macroLogs.push(`\n[완료] 프로세스 종료 (코드: ${code})`);
    macroProcess = null;
  });

  res.json({ ok: true, message: '매크로 시작됨' });
});

app.post('/api/macro/stop', (req, res) => {
  if (!macroProcess) return res.status(400).json({ error: '실행 중인 매크로가 없습니다.' });
  macroProcess.kill('SIGTERM');
  macroProcess = null;
  macroLogs.push('[중단] 사용자에 의해 중단됨');
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
    replyLogs.push(...lines);
  });
  replyProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    replyLogs.push(...lines.map(l => `[ERROR] ${l}`));
  });
  replyProcess.on('close', (code) => {
    replyLogs.push(`\n[완료] 프로세스 종료 (코드: ${code})`);
    replyProcess = null;
  });

  res.json({ ok: true });
});

app.post('/api/replies/stop', (req, res) => {
  if (!replyProcess) return res.status(400).json({ error: '실행 중이 아닙니다.' });
  const force = !!(req.body && req.body.force);
  const signal = force ? 'SIGKILL' : 'SIGTERM';
  replyProcess.kill(signal);
  if (force) {
    replyProcess = null;
    replyLogs.push('[강제 종료] 사용자에 의해 강제 종료됨');
  } else {
    replyLogs.push('[중단] 사용자에 의해 중단됨');
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
    replyLogs.push(...lines);
  });
  replyProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    replyLogs.push(...lines.map(l => `[ERROR] ${l}`));
  });
  replyProcess.on('close', (code) => {
    replyLogs.push(`\n[완료] 프로세스 종료 (코드: ${code})`);
    replyProcess = null;
  });
});

// ─── 서버 시작 ───
app.listen(PORT, () => {
  console.log(`\n  인포크링크 매크로 관리 UI`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  [크론] 매일 일일 총 4번 자동 답장확인 활성화\n`);
});
