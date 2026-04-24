const path = require('path');
const fs = require('fs');

// [요청] settings.json에서 런타임 설정 로드 (UI에서 변경 가능)
const SETTINGS_PATH = path.resolve(__dirname, 'settings.json');
function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch { return {}; }
}

module.exports = {
  // [요청] Supabase 메인 DB 이전 — 현재 Supabase가 메인 DB.
  // 긴급 롤백 시 `USE_SUPABASE=false npm run ui`로 JSON 모드 복귀 가능.
  USE_SUPABASE: process.env.USE_SUPABASE !== 'false',

  // 계정당 주간 발송 제한
  WEEKLY_LIMIT: 10,

  // 브라우저 설정
  // [요청] 외부 배포 대응 — settings.json에서 headless 토글 가능 (외부에서 발송 트리거 시 로컬 크롬창 안 뜨게)
  get HEADLESS() { return !!loadSettings().headless; },
  SLOW_MO: 300,           // 각 동작 사이 딜레이 (ms)

  // 타임아웃
  NAVIGATION_TIMEOUT: 30000,
  ACTION_DELAY: 2000,     // 제안서 발송 사이 대기 (ms)
  LOGOUT_DELAY: 3000,     // 로그아웃 후 대기 (ms)

  // 인포크링크 URL (실제 URL로 변경 필요)
  BASE_URL: 'https://link.inpock.co.kr',

  // 실패한 인플루언서 재시도 여부
  RETRY_FAILED: false,

  // 파일 경로
  PATHS: {
    accounts: path.resolve(__dirname, 'accounts.json'),
    emailAccounts: path.resolve(__dirname, 'emailAccounts.json'),
    products: path.resolve(__dirname, 'products.json'),
    influencers: path.resolve(__dirname, 'influencers.csv'),
    logs: path.resolve(__dirname, 'logs'),
    screenshots: path.resolve(__dirname, 'screenshots'),
  },

  MAIL_SUBJECT_PREFIX: '[언엑스 공동구매]',
  MAIL_SUBJECT_SUFFIX: '공동구매 제안 건',
  // [요청] UI 설정에서 참조자 이메일 변경 가능
  get MAIL_BCC() { return loadSettings().mailBcc || 'ym.jung@undefiancecorp.com'; },
};
