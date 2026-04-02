/**
 * 인포크링크 DOM 셀렉터
 * 사이트: link.inpock.co.kr / business.inpock.co.kr
 */

module.exports = {
  // ===== 로그인 =====
  login: {
    // 로그인 페이지
    pageUrl: 'https://business.inpock.co.kr/auth/login',
    // 아이디 입력
    usernameInput: 'div.input-box input[type="text"]',
    // 비밀번호 입력
    passwordInput: 'div.input-box input[type="password"]',
    // 로그인 버튼 ("인포크비즈니스 로그인")
    submitButton: 'button.inpock-button.size-large.type-primary.full-width',
  },

  // ===== 로그아웃 =====
  logout: {
    // 1. 로그아웃 진입 경로
    adminPageUrl: 'https://business.inpock.co.kr/admin/deal/',
    // 2. 드롭다운 화살표 클릭 (1차)
    arrowDropdown: 'div.css-6eond0',
    // 3. 로그아웃 메뉴 클릭 (2차)
    logoutMenu: 'div.css-eif4od:has(p:text("로그아웃"))',
    // 4. 로그아웃 확인 다이얼로그 버튼
    logoutConfirmButton: 'button.gtm-dialog-confirm-btn.inpock-button.size-medium.type-secondary',
  },

  // ===== 제안서 작성 =====
  proposal: {
    // 1단계: 인플루언서 인포크 링크 페이지에서 제안 버튼
    sendProposalButton: 'button.css-mu3olj.e1usujon0',
    // 1-2단계: "제안 보내기" 버튼
    sendProposalButton2: 'button.inpock-button.size-medium.type-secondary.full-width',

    // 2-1: 이미지 첨부 영역
    imageUploadArea: 'div[type="campaign"].css-1vuordc',
    imageFileInput: 'div[type="campaign"].css-1vuordc input[type="file"]',

    // 2-2: 캠페인 유형 선택 (공동구매 등) - css-gidkuk 영역의 버튼들
    campaignTypeContainer: 'div.css-gidkuk',
    campaignTypeButton: (label) =>
      `div.css-gidkuk button.css-g910fx:has(p:text("${label}"))`,

    // 2-3: 브랜드명
    brandNameInput: 'input[name="brand_name"]',

    // 2-4: 제품명
    productNameInput: 'input[name="product_name"]',

    // 2-5: 카테고리 선택 (육아·키즈 등) - css-1svfnxh 영역의 버튼들
    categoryContainer: 'div.css-1svfnxh',
    categoryButton: (label) =>
      `div.css-1svfnxh button.css-g910fx:has(p:text("${label}"))`,

    // 2-6: 제품 특징 (USP)
    uspTextarea: 'textarea[name="usp"]',

    // 2-7: 제안 내용
    offerMessageTextarea: 'textarea[name="offer_message"]',

    // 3: 제안서 생성 버튼
    submitButton: 'button.inpock-button.size-xlarge.type-primary.full-width',
  },
};
