/**
 * 모든 계정의 발송 횟수 초기화
 * 사용: npm run reset-counts
 */
const fs = require('fs');
const config = require('../config');

const accounts = JSON.parse(fs.readFileSync(config.PATHS.accounts, 'utf-8'));
for (const acc of accounts) {
  acc.weeklyTracking = {};
}
fs.writeFileSync(config.PATHS.accounts, JSON.stringify(accounts, null, 2), 'utf-8');
console.log('모든 계정의 발송 횟수가 초기화되었습니다.');
