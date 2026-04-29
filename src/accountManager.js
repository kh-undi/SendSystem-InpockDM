// [요청] Supabase 메인 DB 이전 — accountManager가 accountsRepo 경유하도록 리팩토링.
// 모든 I/O 함수를 async화. 순수 계산 함수(getSendCount 등)는 sync 유지.
const dayjs = require('dayjs');
const isoWeek = require('dayjs/plugin/isoWeek');
const config = require('../config');
const accountsRepo = require('./repo/accountsRepo');

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
 * 해당 계정의 이번 주 발송 횟수 반환 (sync — account 객체에서 계산)
 */
function getSendCount(account) {
  const weekKey = getCurrentWeekKey();
  return (account.weeklyTracking && account.weeklyTracking[weekKey]) || 0;
}

/**
 * 해당 계정의 이번 주 남은 발송 가능 횟수 (sync)
 */
function getRemainingSlots(account) {
  return config.WEEKLY_LIMIT - getSendCount(account);
}

/**
 * 발송 가능한 계정 찾기 (이번 주 10개 미만 발송한 첫 번째 계정)
 */
async function getAvailableAccount(excludeIds = new Set()) {
  const accounts = await accountsRepo.list();
  return accounts.find(acc => !excludeIds.has(acc.id) && getRemainingSlots(acc) > 0) || null;
}

/**
 * 발송 횟수 1 증가 (즉시 persist, Supabase 모드에서는 원자적 UPSERT)
 */
async function incrementSendCount(accountId) {
  const weekKey = getCurrentWeekKey();
  return accountsRepo.incrementSendCount(accountId, weekKey);
}

// [요청] 주간 카운트 강제 증감 — 수동 발송 보정용. ±delta, 0 미만 클램프는 repo 레이어에서.
async function adjustSendCount(accountId, delta) {
  const weekKey = getCurrentWeekKey();
  return accountsRepo.adjustSendCount(accountId, weekKey, delta);
}

/**
 * 모든 계정이 이번 주 한도를 다 사용했는지 확인
 */
async function allAccountsExhausted() {
  const accounts = await accountsRepo.list();
  return accounts.every(acc => getRemainingSlots(acc) <= 0);
}

/**
 * 전체 계정 상태 요약 (UI용)
 */
async function getStatusSummary() {
  const accounts = await accountsRepo.list();
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
  adjustSendCount,
  allAccountsExhausted,
  getStatusSummary,
};
