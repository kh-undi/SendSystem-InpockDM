/**
 * 인스타그램 DOM 셀렉터
 * 인스타는 클래스명을 자주 바꾸므로 깨지면 여기만 수정.
 */

module.exports = {
  // ===== 로그인 =====
  login: {
    pageUrl: 'https://www.instagram.com/accounts/login/',
    usernameInput: 'input[name="username"]',
    passwordInput: 'input[name="password"]',
    // 로그인 버튼 (form 내부 submit)
    submitButton: 'button[type="submit"]',
    // 로그인 후 종종 뜨는 모달 ("정보 저장" / "알림 설정") 닫기 버튼 텍스트 후보
    notNowButtonTexts: ['나중에 하기', 'Not Now', 'Not now'],
  },

  // ===== 프로필 / 릴스 =====
  profile: {
    reelsTabUrl: (username) => `https://www.instagram.com/${username}/reels/`,
    profileUrl: (username) => `https://www.instagram.com/${username}/`,
    // 릴스 그리드의 카드 앵커 — main 안의 /reel/ 으로 시작하는 모든 링크
    reelCard: 'main a[href*="/reel/"]',
    // 비공개 계정 인디케이터(텍스트 후보)
    privateTexts: ['비공개 계정입니다', 'This Account is Private', 'This account is private'],
  },

  // ===== 단일 릴스 페이지 =====
  reel: {
    // og:description 메타가 가장 안정적인 likes/comments 소스
    ogDescription: 'meta[property="og:description"]',
  },
};
