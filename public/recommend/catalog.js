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

    const photo = firstPhoto(p);
    const name = p.productName || p.name || '';
    const hooking = Array.isArray(p.hookingPhrases) ? p.hookingPhrases : []; // 미사용 — 데이터 없음 (RPC 미포함)

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
    $modalContent.innerHTML = html;
    $modal.style.display = 'flex';
    $modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  window.closeModal = function () {
    $modal.style.display = 'none';
    $modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $modal.style.display === 'flex') {
      window.closeModal();
    }
  });

  loadCatalog();
})();
