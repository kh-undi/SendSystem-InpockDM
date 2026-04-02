const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
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

  const { dryRun } = req.body || {};

  // 인플루언서 데이터를 influencers.json에서 읽어 CSV로 변환 후 실행
  const influencersPath = path.join(__dirname, 'influencers.json');
  const influencers = JSON.parse(fs.readFileSync(influencersPath, 'utf-8'));

  if (influencers.length === 0) {
    return res.status(400).json({ error: '발송할 인플루언서가 없습니다.' });
  }

  // JSON → CSV 변환 (기존 index.js가 CSV를 읽으므로)
  const csvHeader = 'nickname,profileUrl,productName';
  const csvRows = influencers.map(i => `${i.nickname},${i.profileUrl},${i.productName}`);
  fs.writeFileSync(config.PATHS.influencers, [csvHeader, ...csvRows].join('\n'), 'utf-8');

  macroLogs = [];
  const args = [path.join(__dirname, 'src/index.js')];
  if (dryRun) args.push('--dry-run');

  const { spawn } = require('child_process');
  macroProcess = spawn('node', args, { cwd: __dirname });

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

// ─── 서버 시작 ───
app.listen(PORT, () => {
  console.log(`\n  인포크링크 매크로 관리 UI`);
  console.log(`  http://localhost:${PORT}\n`);
});
