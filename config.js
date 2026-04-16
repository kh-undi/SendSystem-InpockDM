const path = require('path');

module.exports = {
  // 계정당 주간 발송 제한
  WEEKLY_LIMIT: 10,

  // 브라우저 설정
  HEADLESS: false,        // true로 바꾸면 브라우저 안 보임
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
    sentLog: path.resolve(__dirname, 'logs/sent.log'),
    logs: path.resolve(__dirname, 'logs'),
    screenshots: path.resolve(__dirname, 'screenshots'),
  },

  MAIL_SUBJECT_PREFIX: '[언엑스 공동구매]',
  MAIL_SUBJECT_SUFFIX: '공동구매 제안 건',
  MAIL_BCC: 'kh.park@undefiancecorp.com',
};
