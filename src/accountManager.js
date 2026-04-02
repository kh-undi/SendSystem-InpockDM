const fs = require('fs');
const dayjs = require('dayjs');
const isoWeek = require('dayjs/plugin/isoWeek');
const config = require('../config');

dayjs.extend(isoWeek);

/**
 * 현재 ISO 주차 문자열 반환 (예: "2026-W14")
 */
function getCurrentWeekKey() {
  const now = dayjs();
  const week = String(now.isoWeek()).padStart(2, '0');
  return `${now.isoWeekYear()}-W${week}`;
}

/**
 * accounts.json 읽기
 */
function loadAccounts() {
  const raw = fs.readFileSync(config.PATHS.accounts, 'utf-8');
  return JSON.parse(raw);
}

/**
 * accounts.json 저장
 */
function saveAccounts(accounts) {
  fs.writeFileSync(config.PATHS.accounts, JSON.stringify(accounts, null, 2), 'utf-8');
}

/**
 * 해당 계정의 이번 주 발송 횟수 반환
 */
function getSendCount(account) {
  const weekKey = getCurrentWeekKey();
  return account.weeklyTracking[weekKey] || 0;
}

/**
 * 해당 계정의 이번 주 남은 발송 가능 횟수
 */
function getRemainingSlots(account) {
  return config.WEEKLY_LIMIT - getSendCount(account);
}

/**
 * 발송 가능한 계정 찾기 (이번 주 10개 미만 발송한 첫 번째 계정)
 */
function getAvailableAccount() {
  const accounts = loadAccounts();
  return accounts.find(acc => getRemainingSlots(acc) > 0) || null;
}

/**
 * 발송 횟수 1 증가 (즉시 파일에 저장)
 */
function incrementSendCount(accountId) {
  const accounts = loadAccounts();
  const account = accounts.find(acc => acc.id === accountId);
  if (!account) throw new Error(`계정 ID ${accountId}를 찾을 수 없습니다.`);

  const weekKey = getCurrentWeekKey();
  account.weeklyTracking[weekKey] = (account.weeklyTracking[weekKey] || 0) + 1;
  saveAccounts(accounts);

  return account.weeklyTracking[weekKey];
}

/**
 * 모든 계정이 이번 주 한도를 다 사용했는지 확인
 */
function allAccountsExhausted() {
  const accounts = loadAccounts();
  return accounts.every(acc => getRemainingSlots(acc) <= 0);
}

/**
 * 전체 계정 상태 요약 출력용
 */
function getStatusSummary() {
  const accounts = loadAccounts();
  const weekKey = getCurrentWeekKey();
  return accounts.map(acc => ({
    id: acc.id,
    username: acc.username,
    sent: getSendCount(acc),
    remaining: getRemainingSlots(acc),
    week: weekKey,
  }));
}

module.exports = {
  getCurrentWeekKey,
  getAvailableAccount,
  getRemainingSlots,
  incrementSendCount,
  allAccountsExhausted,
  getStatusSummary,
};
