const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cron = require('node-cron');
const config = require('./config');
const accountManager = require('./src/accountManager');

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
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

// ─── 계정 API ───
app.get('/api/accounts', (req, res) => {
  const accounts = JSON.parse(fs.readFileSync(config.PATHS.accounts, 'utf-8'));
  const weekKey = accountManager.getCurrentWeekKey();
  const result = accounts.map(acc => ({
    ...acc,
    sent: acc.weeklyTracking[weekKey] || 0,
    remaining: config.WEEKLY_LIMIT - (acc.weeklyTracking[weekKey] || 0),
    week: weekKey,
  }));
  res.json(result);
});

app.put('/api/accounts', (req, res) => {
  const accounts = req.body;
  fs.writeFileSync(config.PATHS.accounts, JSON.stringify(accounts, null, 2), 'utf-8');
  res.json({ ok: true });
});

app.post('/api/accounts/reset', (req, res) => {
  const accounts = JSON.parse(fs.readFileSync(config.PATHS.accounts, 'utf-8'));
  for (const acc of accounts) acc.weeklyTracking = {};
  fs.writeFileSync(config.PATHS.accounts, JSON.stringify(accounts, null, 2), 'utf-8');
  res.json({ ok: true });
});

// ─── 이메일 계정 API (Gmail) ───
app.get('/api/emailAccounts', (req, res) => {
  if (!fs.existsSync(config.PATHS.emailAccounts)) {
    fs.writeFileSync(config.PATHS.emailAccounts, '[]', 'utf-8');
  }
  const list = JSON.parse(fs.readFileSync(config.PATHS.emailAccounts, 'utf-8'));
  // 비밀번호는 마스킹하지 않고 그대로 반환 (UI에서 수정 가능해야 함)
  res.json(list);
});

app.put('/api/emailAccounts', (req, res) => {
  const list = req.body;
  fs.writeFileSync(config.PATHS.emailAccounts, JSON.stringify(list, null, 2), 'utf-8');
  res.json({ ok: true });
});

app.post('/api/emailAccounts/verify', async (req, res) => {
  const { id } = req.body || {};
  const { findEmailAccount, verifyTransport } = require('./src/emailSender');
  const acc = findEmailAccount(id);
  if (!acc) return res.status(404).json({ error: '이메일 계정을 찾을 수 없습니다.' });
  try {
    await verifyTransport(acc);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ─── 제품 API ───
app.get('/api/products', (req, res) => {
  const data = JSON.parse(fs.readFileSync(config.PATHS.products, 'utf-8'));
  res.json(data.products);
});

app.put('/api/products', (req, res) => {
  const products = req.body;
  fs.writeFileSync(config.PATHS.products, JSON.stringify({ products }, null, 2), 'utf-8');
  res.json({ ok: true });
});

app.post('/api/products/upload', upload.array('photos', 10), (req, res) => {
  const files = req.files.map(f => f.path.replace(/\\/g, '/'));
  res.json({ files });
});

// ─── 인플루언서 API ───
app.get('/api/influencers', (req, res) => {
  const filePath = path.join(__dirname, 'influencers.json');
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]', 'utf-8');
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  res.json(data);
});

app.put('/api/influencers', (req, res) => {
  const data = req.body;
  fs.writeFileSync(path.join(__dirname, 'influencers.json'), JSON.stringify(data, null, 2), 'utf-8');
  res.json({ ok: true });
});

// ─── 발송 로그 API ───
app.get('/api/logs', (req, res) => {
  if (!fs.existsSync(config.PATHS.sentLog)) return res.json([]);
  const content = fs.readFileSync(config.PATHS.sentLog, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim()).map(line => {
    const [timestamp, accountId, nickname, profileUrl, productName] = line.split(',');
    return { timestamp, accountId, nickname, profileUrl, productName };
  });
  res.json(lines);
});

// ─── 실패 목록 API ───
app.get('/api/failed', (req, res) => {
  const failedPath = path.join(__dirname, 'failed.json');
  if (!fs.existsSync(failedPath)) return res.json([]);
  const data = JSON.parse(fs.readFileSync(failedPath, 'utf-8'));
  res.json(data);
});

app.delete('/api/failed', (req, res) => {
  const failedPath = path.join(__dirname, 'failed.json');
  if (fs.existsSync(failedPath)) fs.unlinkSync(failedPath);
  res.json({ ok: true });
});

app.post('/api/failed/retry', (req, res) => {
  const failedPath = path.join(__dirname, 'failed.json');
  if (!fs.existsSync(failedPath)) return res.status(400).json({ error: '실패 목록이 없습니다.' });
  const failed = JSON.parse(fs.readFileSync(failedPath, 'utf-8'));
  // 실패 목록을 인플루언서 목록에 추가
  const infPath = path.join(__dirname, 'influencers.json');
  const current = fs.existsSync(infPath) ? JSON.parse(fs.readFileSync(infPath, 'utf-8')) : [];
  const toAdd = failed.map(({ nickname, profileUrl, productName }) => ({ nickname, profileUrl, productName }));
  fs.writeFileSync(infPath, JSON.stringify([...current, ...toAdd], null, 2), 'utf-8');
  // 실패 목록 초기화
  fs.unlinkSync(failedPath);
  res.json({ ok: true, added: toAdd.length });
});

// ─── 매크로 실행 API ───
let macroProcess = null;
let macroLogs = [];

app.post('/api/macro/start', (req, res) => {
  if (macroProcess) return res.status(400).json({ error: '이미 실행 중입니다.' });

  const { dryRun, emailAccountId } = req.body || {};

  // 인플루언서 데이터를 influencers.json에서 읽어 CSV로 변환 후 실행
  const influencersPath = path.join(__dirname, 'influencers.json');
  const influencers = JSON.parse(fs.readFileSync(influencersPath, 'utf-8'));

  if (influencers.length === 0) {
    return res.status(400).json({ error: '발송할 인플루언서가 없습니다.' });
  }

  // 이메일 타겟이 있는데 이메일 계정이 지정/존재하지 않으면 중단
  const hasEmailTarget = influencers.some(i => (i.profileUrl || '').includes('@'));
  if (hasEmailTarget) {
    const { findEmailAccount } = require('./src/emailSender');
    if (!findEmailAccount(emailAccountId)) {
      return res.status(400).json({ error: '이메일 주소가 포함되어 있으나 선택된 Gmail 계정이 없습니다.' });
    }
  }

  // JSON → CSV 변환 (기존 index.js가 CSV를 읽으므로)
  const csvHeader = 'nickname,profileUrl,productName';
  const csvRows = influencers.map(i => `${i.nickname},${i.profileUrl},${i.productName}`);
  fs.writeFileSync(config.PATHS.influencers, [csvHeader, ...csvRows].join('\n'), 'utf-8');

  macroLogs = [];
  const args = [path.join(__dirname, 'src/index.js')];
  if (dryRun) args.push('--dry-run');

  const { spawn } = require('child_process');
  const env = { ...process.env };
  if (emailAccountId != null && emailAccountId !== '') {
    env.EMAIL_ACCOUNT_ID = String(emailAccountId);
  }
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

app.get('/api/replies/status', (req, res) => {
  const repliesPath = path.join(__dirname, 'replies.json');
  let results = null;
  if (fs.existsSync(repliesPath)) {
    try { results = JSON.parse(fs.readFileSync(repliesPath, 'utf-8')); } catch {}
  }
  res.json({ running: replyProcess !== null, logs: replyLogs, results });
});

// ─── 매일 오전,오후 총 4번 자동 답장확인 ───
cron.schedule('30 8,10,12,14 * * *', () => {
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
