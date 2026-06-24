// [요청] 추천 카탈로그 페이지 — 공개 갤러리 + 모달 (Vercel 배포용)
//   URL 파라미터 ?c=<code> 또는 ?code=<code> 로 코드 추출
//   Supabase RPC get_catalog_by_code 호출 → 렌더
//   anon 키는 SUPABASE_ANON_KEY로 공개 (RLS + RPC SECURITY DEFINER 정책으로 보호)

(function () {
  'use strict';

  const $loading = document.getElementById('loading');
  const $error = document.getElementById('error');
  const $catalog = document.getElementById('catalog');
  const $title = document.getElementById('catalogTitle');
  const $grid = document.getElementById('grid');
  const $footer = document.getElementById('footerNote');
  const $modal = document.getElementById('modal');
  const $modalContent = document.getElementById('modalContent');

  let catalogData = null;
  let currentIdx = -1; // [요청] 모달에 열린 제품 인덱스 — 좌우 이동 버튼/키보드용

  function getCodeFromUrl() {
    const params = new URLSearchParams(location.search);
    return params.get('c') || params.get('code') || '';
  }

  function showError(msg) {
    $loading.style.display = 'none';
    $error.style.display = 'block';
    $error.textContent = msg;
  }

  function esc(s) {
    return (s == null ? '' : String(s))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function isValidConfig() {
    return typeof window.SUPABASE_URL === 'string'
      && /^https?:\/\//.test(window.SUPABASE_URL)
      && typeof window.SUPABASE_ANON_KEY === 'string'
      && window.SUPABASE_ANON_KEY.length > 20;
  }

  async function loadCatalog() {
    const code = getCodeFromUrl();
    if (!code) {
      showError('유효한 카탈로그 링크가 아닙니다.');
      return;
    }
    if (!isValidConfig()) {
      showError('설정 오류: config.js의 SUPABASE_URL / SUPABASE_ANON_KEY를 확인해주세요.');
      return;
    }

    const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    const { data, error } = await client.rpc('get_catalog_by_code', { p_code: code });

    if (error) {
      console.error(error);
      showError('카탈로그를 불러오지 못했습니다.');
      return;
    }
    if (!data) {
      showError('존재하지 않거나 만료된 카탈로그입니다.');
      return;
    }

    catalogData = data;
    render(data);
  }

  function render(data) {
    $loading.style.display = 'none';
    $catalog.style.display = 'block';

    const title = data.title || `${data.influencerNickname || ''}님 공동구매 제안`;
    document.title = title;
    $title.textContent = title;

    const products = Array.isArray(data.products) ? data.products : [];
    if (!products.length) {
      $grid.innerHTML = '<div class="state-msg" style="grid-column:1/-1">선택된 제품이 없습니다.</div>';
    } else {
      $grid.innerHTML = products.map((p, i) => productCardHTML(p, i)).join('');
    }
    $footer.textContent = `총 ${products.length}개 제품 · UNX`;

    // 카드 클릭 → 모달
    $grid.querySelectorAll('[data-idx]').forEach(el => {
      el.addEventListener('click', () => openModal(Number(el.dataset.idx)));
    });
  }

  function firstPhoto(p) {
    return Array.isArray(p.photos) && p.photos.length ? p.photos[0] : '';
  }

  function productCardHTML(p, idx) {
    const photo = firstPhoto(p);
    const name = p.productName || p.name || '';
    return `<div class="product-card" data-idx="${idx}">
      ${photo
        ? `<img class="product-photo" src="${esc(photo)}" alt="${esc(name)}" loading="lazy">`
        : `<div class="product-photo-placeholder">이미지 없음</div>`}
      <div class="product-body">
        <div class="product-name">
          <span class="check">✓</span>
          <span>${esc(name)}</span>
        </div>
        ${p.brandName ? `<span class="brand-chip">${esc(p.brandName)}</span>` : ''}
      </div>
    </div>`;
  }

  function openModal(idx) {
    const p = catalogData?.products?.[idx];
    if (!p) return;

    currentIdx = idx; // [요청] 현재 인덱스 저장 — prev/next 재호출 기준
    const total = Array.isArray(catalogData?.products) ? catalogData.products.length : 0;
    const photo = firstPhoto(p);
    const name = p.productName || p.name || '';
    const hooking = Array.isArray(p.hookingPhrases) ? p.hookingPhrases : []; // 미사용 — 데이터 없음 (RPC 미포함)

    // [요청] 좌우 이동 버튼 — 첫 제품은 ▶만, 마지막은 ◀만
    const prevBtn = idx > 0
      ? `<button class="modal-nav prev" onclick="prevProduct()" aria-label="이전 제품">‹</button>` : '';
    const nextBtn = idx < total - 1
      ? `<button class="modal-nav next" onclick="nextProduct()" aria-label="다음 제품">›</button>` : '';

    let html = '';
    html += `<button class="modal-close" onclick="closeModal()" aria-label="닫기">✕</button>`;
    if (photo) {
      html += `<img class="modal-photo" src="${esc(photo)}" alt="${esc(name)}">`;
    }
    html += `<div class="modal-body">`;
    html += `<div class="modal-check">✓</div>`;
    html += `<div class="modal-title">${esc(name)}</div>`;
    if (p.brandName) html += `<span class="modal-brand">${esc(p.brandName)}</span>`;

    if (p.announceExampleLink) {
      html += `<div class="modal-section">
        <div class="modal-section-label">🔗 인스타 공구 예시</div>
        <div class="modal-section-body"><a href="${esc(p.announceExampleLink)}" target="_blank" rel="noopener">${esc(p.announceExampleLink)}</a></div>
      </div>`;
    }
    if (p.productLink) {
      html += `<div class="modal-section">
        <div class="modal-section-label">🔗 제품 상세 페이지</div>
        <div class="modal-section-body"><a href="${esc(p.productLink)}" target="_blank" rel="noopener">${esc(p.productLink)}</a></div>
      </div>`;
    }
    if (p.usp) {
      html += `<div class="modal-section">
        <div class="modal-section-label">⭐ 콘텐츠 포인트</div>
        <div class="modal-section-body" style="white-space:pre-wrap">${esc(p.usp)}</div>
      </div>`;
    }
    if (p.offerMessage) {
      html += `<hr class="divider">
      <div class="modal-section">
        <div class="modal-section-label">📋 제안 내용</div>
        <div class="modal-section-body" style="white-space:pre-wrap">${esc(p.offerMessage)}</div>
      </div>`;
    }
    if (p.ageRange) {
      html += `<div class="modal-section">
        <div class="modal-section-label">👶 추천 연령</div>
        <div class="modal-section-body">${esc(p.ageRange)}</div>
      </div>`;
    }

    html += `</div>`;
    // 좌우 이동 버튼은 모달 카드 직속 자식 → 카드(팝업) 세로 중앙에 위치
    html += prevBtn + nextBtn;
    $modalContent.innerHTML = html;
    $modal.style.display = 'flex';
    $modal.setAttribute('aria-hidden', 'false');
    $modal.scrollTop = 0; // [요청] 열 때/제품 넘길 때 상세 내용을 항상 상단부터 보이게(이전 스크롤 위치 리셋)
    // [요청-버그] prev/next 재호출 시 중복 잠금 방지 — 처음 열 때만 배경 스크롤 잠금
    if (!document.body.classList.contains('modal-open')) lockScroll();
  }

  // [요청-버그] 모바일 배경 스크롤 잠금 — body를 position:fixed로 고정해 뒤 목록이 안 움직이게(스크롤 위치 저장/복원)
  let savedScrollY = 0;
  function lockScroll() {
    savedScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.classList.add('modal-open');
  }
  function unlockScroll() {
    document.body.classList.remove('modal-open');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    window.scrollTo(0, savedScrollY);
  }

  window.closeModal = function () {
    $modal.style.display = 'none';
    $modal.setAttribute('aria-hidden', 'true');
    unlockScroll(); // [요청-버그] 배경 스크롤 잠금 해제 + 위치 복원
    currentIdx = -1; // [요청] 닫을 때 인덱스 리셋
  };

  // [요청] 이전/다음 제품으로 이동 — 모달 통째로 다시 그림(기존 패턴), 경계 가드
  window.prevProduct = function () {
    if (currentIdx > 0) openModal(currentIdx - 1);
  };
  window.nextProduct = function () {
    const total = Array.isArray(catalogData?.products) ? catalogData.products.length : 0;
    if (currentIdx >= 0 && currentIdx < total - 1) openModal(currentIdx + 1);
  };

  document.addEventListener('keydown', (e) => {
    if ($modal.style.display !== 'flex') return;
    if (e.key === 'Escape') window.closeModal();
    else if (e.key === 'ArrowLeft') window.prevProduct();   // [요청] ← 이전 제품
    else if (e.key === 'ArrowRight') window.nextProduct();  // [요청] → 다음 제품
  });

  // [요청] 모바일 좌우 스와이프로 이전/다음 제품 이동 — 세로 스크롤과 구분되게 가로 우세할 때만
  let touchStartX = 0, touchStartY = 0;
  $modalContent.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  }, { passive: true });
  $modalContent.addEventListener('touchend', (e) => {
    if ($modal.style.display !== 'flex') return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    // 가로 이동이 충분히 크고(50px↑) 세로보다 우세할 때만 → 세로 스크롤 오작동 방지
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) window.nextProduct();  // 왼쪽으로 밀기 → 다음 제품
      else window.prevProduct();         // 오른쪽으로 밀기 → 이전 제품
    }
  }, { passive: true });

  loadCatalog();
})();
