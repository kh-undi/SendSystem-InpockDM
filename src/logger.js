const fs = require('fs');
const path = require('path');
const config = require('../config');

/**
 * 발송 성공 로그 기록 (sent.log)
 * 재실행 시 이미 보낸 인플루언서를 건너뛰기 위해 사용
 */
function logSent(accountId, influencer) {
  const logDir = path.dirname(config.PATHS.sentLog);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const line = `${timestamp},${accountId},${influencer.nickname},${influencer.profileUrl},${influencer.productName}\n`;
  fs.appendFileSync(config.PATHS.sentLog, line, 'utf-8');
}

module.exports = { logSent };
