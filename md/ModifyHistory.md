1. 요청사항 제목시작을 '## ' 으로 시작함.
2. 요청사항을 읽고 '실행계획' 영역에 작업할 내용을 추가함. 그 전까지 클로드코드는 작업시작 명령 없이 코드수정을 하지 않음
3. 작업시작하면 코드에 작업내용 주석추가
4. 요청사항 작업이 끝나면 '요청사항' 내용을 '작업완료' 상단으로 이동시킨다. 수정내용 제목 맨 뒤에 날짜(yy.mm.dd) 기재
5. 수행한 실행계획 내용은 지운다. 

[ 요청사항 ]

## 제안서 이미지 경로 정리 — Storage 단일 원본 + temp 캐시
인포크 제안서 발송 시 Playwright `setInputFiles`에 넣는 이미지 경로 해석 로직([src/proposal.js](src/proposal.js))을 정리. 현재 `assets/` 폴더가 (1)레거시 (2)UI 업로드 임시저장 (3)제안서 발송 캐시 3역할을 겸해 "신뢰 원본"이 모호함.

- **핵심 리스크**: [src/proposal.js:50-58](src/proposal.js#L50-L58) 빠른 경로가 **basename(파일명)만으로** `assets/` 매칭 → Storage에 새 이미지를 올렸는데 `assets/`에 같은 이름의 옛 파일이 남아 있으면 **오래된 이미지를 조용히 발송**(에러 없음 = 발견 어려움).
- **방향(상의용, 구현 X)**:
  - **추천안**: Supabase Storage = 단일 원본, 로컬은 순수 캐시. `assets/` basename 빠른 경로 제거 → 항상 Storage URL에서 `%TEMP%/inpock-photos/`로 받되, 캐시 키를 basename이 아니라 **URL 해시 또는 Storage ETag/last-modified**로 바꿔 내용이 다르면 재다운로드. `assets/`는 레거시+UI 업로드 스테이징 전용으로 축소.
  - **최소수정안**: 빠른 경로 유지하되 basename 매칭 대신 Storage의 size/ETag와 비교(HEAD 1회) → 다르면 재다운로드.
- 이메일 발송(nodemailer)은 URL 직접 첨부라 무영향. 어느 안이든 "옛 이미지 발송" 리스크 제거가 목표. 정식 진행 시 안 택일 후 요청.

## 제품 추천 시스템 — 관심 제품 기반 연관 추천
인플루언서가 A 제품에 관심을 보이면 함께 제안할 만한 연관 제품을 추천. 현재 제품 ~50개 규모. 분류 방식·구현 방향 미정 상태이며, 후속 요청에서 구체화 예정.

- 사전 검토(상의용, 구현 X):
  - **옵션 1** 카테고리/태그 기반 가중치 매칭 — 가장 단순, `products`에 `tags TEXT[]` 컬럼 추가 검토.
  - **옵션 2** 텍스트 임베딩 코사인 유사도 — `pgvector` 컬럼, `usp + offerMessage + brand + category` 합쳐 임베딩.
  - **옵션 3** Claude API에 50개 메타데이터 던지고 추천 받기 — prompt caching 활용, 추천 이유까지 동시 수령해 `leads.notes`에 자동 기록 가능.
  - **옵션 4** 하이브리드 — 옵션1로 후보 10개 추리고 옵션3이 순위 매기기.
- 갈피 잡히면 위 옵션 중 하나(또는 별안)로 정식 요청 예정. 그 전까진 코드 수정 없음.

## 답장확인 '거절' 표시하기
<div role="link" tabindex="-1" class="css-16qcn4y"><div class="css-1yo7vlv"><div class="css-1a42sk4" width="48"><img src="https://d13k46lqgoj3d6.cloudfront.net/2025/5/29/2025-5-29-1748521327425.webp?w=300" width="48" class="css-14kdq5w"></div><div class="css-1o9ehop"><div class="css-7luk43"><p class="inpock-typography paragraph-2">happy.jiwoo</p><span class="inpock-typography small-text sendbird-channel-preview__content__upper__last-message-at" style="color: rgb(151, 151, 151); word-break: keep-all; min-width: 60px; text-align: end;">10:59</span></div><span class="inpock-typography small-text css-f2ehsn" style="color: rgb(151, 151, 151);">공동구매 <span class="text-gray-300">|</span> 시너지업팩토리 <span class="text-gray-300">|</span> 알파10.5</span><div class="css-7luk43"><p class="inpock-typography paragraph-2 sendbird-channel-preview__content__lower__last-message line-clamp" style="color: rgb(151, 151, 151); -webkit-line-clamp: 1;">(제안 거절) 상대방과 더 이상 대화할 수 없는 채팅방 입니다.</p></div></div></div></div>

거절일 경우 '제안 거절' 메시지에 남겨져있음. 이럴경우 
N명에게서 답장 (M명 거절)
이렇게 표기 하도록




## '유틸리티' 탭 → '메모'로 변경 + 우측 끝(주황 영역)으로 분리
'유틸리티' 탭(자주 사용하는 문구, `data-panel="phrases"`)은 직원용이라 성질이 다름. 탭 이름을 '메모'로 바꾸고, 이 탭만 헤더 우측 끝(스크린샷의 주황색 영역)으로 떨어뜨려 다른 업무 탭들과 시각적으로 구분.

[ 실행계획 ]

## '유틸리티' 탭 → '메모'로 변경 + 우측 끝으로 분리
- **[public/index.html:276](public/index.html#L276)**: 탭 라벨 `유틸리티` → `메모`로 변경. 주석도 갱신.
- **우측 끝 이동**: `.tabs`가 flexbox이므로 해당 탭에 `margin-left:auto`를 주면 그 탭부터 오른쪽으로 밀림. 단 현재 마크업 순서상 '메모' 뒤에 '📊 인스타분석' 탭이 있어, `margin-left:auto`만 주면 인스타분석까지 같이 우측에 붙음. → '메모' 탭 마크업을 인스타분석 탭 **뒤(마지막)**로 이동시킨 뒤 `margin-left:auto` 부여 → 메모 탭만 단독으로 우측 끝에 배치.
- 구현 방식: 인라인 `style="margin-left:auto"` 또는 전용 클래스(`.tab-right`) 신설 중 택1(전용 클래스 권장, 모바일 `.tabs{overflow-x:auto}`와 충돌 시 점검). 탭 클릭/패널 전환 로직은 `data-panel` 기반이라 순서 이동에 영향 없음(확인 필요).
- UI 전용 변경, 백엔드/repo 무영향.

[ 작업완료 ]
## 제안 버튼 셀렉터 — '비즈니스 제안' 텍스트 기반 0순위 + 기존 클래스 폴백 유지 (26.06.19)
인포크 인플루언서 페이지의 1단계 제안 버튼이 새 양식(`<button class="css-1dhefbq e13yc11r0">…<span>비즈니스 제안</span></button>`)으로 바뀌어 기존 해시 클래스 셀렉터(`button.css-mu3olj.e1usujon0`)가 매칭 실패하던 문제. 텍스트 기반 셀렉터를 0순위, 기존 클래스를 폴백으로 둠.
- **[src/selectors.js:39-44](src/selectors.js#L39-L44)**: `proposal.sendProposalButton`을 문자열→배열로 변경. `['button:has(span:text("비즈니스 제안"))'(0순위, 텍스트), 'button.css-mu3olj.e1usujon0'(폴백, 기존 클래스)]`.
- **[src/proposal.js:107-119](src/proposal.js#L107-L119)**: 단건 `page.$()` 조회를 셀렉터 배열 순회로 교체 — 처음 잡히는 버튼 사용, 전부 못 찾으면 기존처럼 "제안 버튼이 없음" 처리. 배열/단일 문자열 모두 허용(`Array.isArray` 가드)해 향후 호환 유지.
- 사용처는 proposal.js 1곳뿐(grep 확인) → 호환 리스크 없음. `node --check` 통과. 실동작은 수동(`npm run ui`).
## 협업종료 버튼 노란색감으로 변경 (26.06.15)
제조사 목록의 '협업종료' 버튼을 노란색 계열로 변경. UI 전용([public/index.html](public/index.html)).
- `.btn-warn` CSS 신설(`.btn-outline` 아래): 옅은 노란 배경(`#fffbeb`)+노란 테두리(`#f59e0b`)/글씨(`#b45309`), hover `#fef3c7`.
- 제조사 행 '협업종료' 버튼(`endManufacturer`) 클래스 `btn-outline`→`btn-warn`. '진행 복귀'는 btn-outline 유지, 제품 카드 토글 버튼은 미변경.
## 제품 상세에 '제조사 메모' 표시 추가 (26.06.15)
제품 상세 메모(`products.memo`)와 제조사 메모(`manufacturers.memo`)는 서로 다른 테이블 필드. 제품 상세에서 연결 제조사의 메모를 함께 볼 수 있게 추가하고, 제조사 폼 라벨도 정리. UI 전용 변경([public/index.html](public/index.html)) — 백엔드/repo/스키마 변경 없음(`manufacturers` 배열에 `memo` 이미 로드, 제품 카드에 `manufacturerId` 보유).
- **제품 목록 탭 — 제조사 메모 표시(읽기전용)**: `renderProducts()` 상단 그리드 제품명↔카테고리 사이에 '제조사 메모' 블록 신설(full-width `grid-column:1/-1`로 제조사·제품명 행 다음 / 카테고리·캠페인유형 행 앞에 위치 → 요청 순서 제조사→제품명→제조사 메모→카테고리→캠페인 유형 충족). 인라인 IIFE로 `manufacturers.find(x => x.id === p.manufacturerId)` 조회 후 `m.memo`를 readonly textarea(회색 배경)로 노출, 제조사 미선택 시 "제조사 선택 시 표시" / 선택했지만 메모 없으면 "제조사 메모 없음" placeholder. `selectManufacturer`가 끝에서 `renderProducts()` 호출하므로 제조사 변경 시 자동 갱신.
- **제조사 목록 탭 — 라벨 변경**: 제조사 추가/수정 폼 '메모' → '제조사 메모'(id `mfrMemo`·저장 로직 유지).
- 제품 자체 메모(내부용)는 기존대로 편집 가능(별개 유지). 제조사 메모 비었을 때 제품 메모로의 기존 1회 상속(`selectManufacturer`)도 유지(변경 없음).

## 제조사 목록 — 협업종료 외 '삭제' 버튼 추가 (확인 모달, 연결 제품도 함께 삭제) (26.06.15)
제조사 목록 각 행에 협업종료(유지)와 별개로 '삭제' 버튼 추가. 삭제 시 확인 모달(빨강 글씨 "연결된 제품 N개도 같이 삭제됩니다." + "삭제하시겠습니까?")을 띄우고, 확인하면 **제조사 + 연결 제품을 함께 하드 삭제**.
- **동작 변경**: 기존 `removeOne`은 FK set null(제품 보존)이었으나, 이제 연결 제품까지 함께 삭제.
- **productsRepo** [src/repo/productsRepo.js](src/repo/productsRepo.js): `removeByManufacturer(manufacturerId)` 신설(dual-mode) — Supabase `delete().eq('manufacturer_id', id)`(product_photos는 FK cascade 자동), JSON은 해당 제품 제거 후 저장. export 추가.
- **manufacturersRepo** [src/repo/manufacturersRepo.js](src/repo/manufacturersRepo.js): 공용 `removeOne(id)`이 제조사 삭제 전 `productsRepo.removeByManufacturer(id)` 호출(제품 먼저 → 제조사). `removeOneJson`의 기존 manufacturerId 정리(setStatusByManufacturer clearManufacturer) 호출 제거, `removeOneSupabase` 주석 갱신.
- **Server** [server.js](server.js): `DELETE /api/manufacturers/:id` 그대로(내부 removeOne이 캐스케이드). 변경 없음.
- **UI** [public/index.html](public/index.html): `renderManufacturers()` 각 행에 `삭제` 버튼(흰 배경+빨간 테두리/글씨, 협업종료는 btn-outline 회색으로 변경해 위계 구분). 삭제 확인 모달 `#manufacturerDeleteModal` 신설(modal-backdrop 패턴, ESC/✕만 닫힘) — `#manufacturerDeleteName`/`#manufacturerDeleteWarn`(빨강 N) + "삭제하시겠습니까?" + [취소]/[확인]. `openManufacturerDeleteModal(id)`/`closeManufacturerDeleteModal()`/`confirmDeleteManufacturer()`(DELETE → loadManufacturers+renderManufacturers+loadProducts → 토스트). `MODAL_CLOSERS`에 등록.
- 검증: `node --check`(server/repos) 통과, index.html 인라인 스크립트 파싱 OK, JSON 모드 캐스케이드 삭제 테스트(제조사A 삭제 시 A제품 2건 동반 삭제, 타 제조사 제품 보존) 확인. 실동작은 수동(`npm run ui`).
## 제조사 관리 기능 — 제조사 추가 → 제품 추가 흐름 (26.06.12)
제품 관리 1Depth 아래 2Depth(제품 목록 / 제조사 목록) 신설. 제조사를 먼저 등록하면 제품 추가 시 선택만으로 브랜드명·허들·일정·메모가 채워짐. 삭제 대신 `협업종료` 상태값 도입(제조사 협업종료 시 연결 제품도 캐스케이드). 기존 ~70건은 brand_name 기준 제조사 자동 생성 + 연결 스크립트 제공.
- **스키마** [scripts/schema.sql](scripts/schema.sql): 12번 블록 신설 — `manufacturers`(id/name unique/contact_person/contact/hurdle/schedule/memo/`status` default ''/created_at/updated_at) + `alter table products add manufacturer_id int references manufacturers(id) on delete set null` + `add status text not null default ''` + `idx_products_manufacturer`. ⚠️ 운영 Supabase는 이 블록 SQL Editor에서 1회 실행 필요. (manufacturers를 먼저 create 후 products ALTER가 참조하므로 한 블록 내 순서 안전.)
- **config.js** [config.js](config.js): `PATHS.manufacturers`(manufacturers.json) 추가.
- **Repo 신설** [src/repo/manufacturersRepo.js](src/repo/manufacturersRepo.js): dual-mode. `list`(productCount·status 포함, name 정렬)/`insertOne`/`updateOne`/`removeOne` + `endCollaboration(id)`/`reopen(id)`. validation `NAME_REQUIRED`, `DUPLICATE_NAME`(23505), `NOT_FOUND`(PGRST116). `endCollaboration`은 제조사 status='협업종료' + productsRepo.`setStatusByManufacturer`로 연결 제품 캐스케이드. `reopen`은 제조사만 복귀(제품 미변경). productCount는 productsRepo.list 기반 집계(양 모드 공통). 순환참조 없음(productsRepo는 manufacturersRepo를 require 안 함).
- **productsRepo** [src/repo/productsRepo.js](src/repo/productsRepo.js): `toRow`/`replaceAllSupabase`/`listSupabase` select·반환에 `manufacturer_id`(↔`manufacturerId`)·`status` 추가. JSON 모드는 spread로 패스스루. `setStatusByManufacturer(manufacturerId, status, {clearManufacturer})` 헬퍼 신설 — Supabase 1쿼리 update / JSON 배열 순회. `clearManufacturer`는 JSON 모드 제조사 삭제 시 manufacturerId null 정리용.
- **Server** [server.js](server.js): `GET/POST /api/manufacturers`, `PUT /api/manufacturers/:id`, `PUT /api/manufacturers/:id/status`(협업종료/복귀), `DELETE /api/manufacturers/:id` 추가. `validateProductBody`에 manufacturerId 필수(`'제조사를 선택해주세요...'`→400). 빠른추가(`/api/products/quick`)도 manufacturerId 필수 + brandName은 선택 제조사명 사용.
- **UI** [public/index.html](public/index.html): 제품 관리 1depth를 `data-group="products"` 그룹 탭으로, `#subtabs-products`(제품 목록/제조사 목록) 신설. 탭 JS를 `SUBGROUPS` 맵 + 제네릭 `activateSub(group, panel)`로 리팩터(기존 `activateInpockSub`는 래퍼 유지, 1depth/서브탭/`goToSettings` 모두 다중 그룹 대응). `#panel-manufacturers` 신설(제조사 목록 + 인라인 추가/수정 폼 `manufacturerFormBox` + 협업종료/복귀 버튼 + 검색·"협업종료 포함" 토글). 제품 카드의 브랜드명 input → **제조사 검색 콤보박스**(검색 input + `#mfrSelect-{i}`, 협업종료 제조사 기본 제외): 선택 시 manufacturerId+brandName+빈 허들/일정/메모 상속. 제품 카드에 협업종료/복귀 토글 + `ended` 회색 처리 + 기본 숨김("협업종료 포함" 토글). 빠른추가 모달도 제조사 콤보박스로 교체. init은 `loadManufacturers().then(loadProducts)`로 콤보박스 옵션 선로딩. CSS `.manufacturer-row(.ended)`/`.manufacturer-form`/`.mfr-ended-badge`/`.product-card.ended`/`.product-ended-badge` 신설.
- **마이그레이션** [scripts/migrateBrandsToManufacturers.js](scripts/migrateBrandsToManufacturers.js) 신설: distinct brand_name → manufacturers 생성(멱등) + manufacturer_id 비어있는 제품을 brand_name==name으로 연결. dual-mode, dry-run 기본 / `--force` 반영. ⚠️ **제품 제조사 필수 검증이 이미 적용돼 있으므로, 기존 제품을 다시 저장하려면 이 스크립트를 먼저 `--force`로 1회 실행**해야 함.
- **CLAUDE.md** [CLAUDE.md](CLAUDE.md): 테이블 11→12개(`manufacturers` 추가, products manufacturer_id/status 표기), repo 목록·JSON 폴백(`manufacturers.json`) 갱신.
- 검증: `node --check`(server/repos/config/migration) 통과. index.html 인라인 스크립트 파싱 OK. JSON 모드 기능 테스트로 협업종료 캐스케이드/복귀/productCount/중복차단/삭제 시 manufacturerId 정리까지 확인. index.html 실동작은 수동(`npm run ui`).
- **운영 적용 순서**: ① schema.sql 12번 블록 Supabase 실행 → ② `node scripts/migrateBrandsToManufacturers.js`(dry-run 확인) → ③ `--force` 반영 → ④ UI 확인.

## 발송 ↔ 답장확인 상호 배타 + 헤더 뱃지 3분기 (26.06.09)
발송과 답장확인을 동시 실행 못 하게 막고(기존엔 "발송 중→답장확인"만 차단되고 "답장확인 중→발송"은 뚫려 있던 비대칭 구멍), 우상단 헤더 뱃지를 발송/답장확인/준비 3분기로 표시.
- **상호 배타** [server.js](server.js): `/api/macro/start`에 `if (replyProcess) return 400('답장확인이 실행 중입니다.')` 추가. 반대 방향(`/api/replies/check`의 macroProcess 체크)은 이미 존재 → 양방향 배타 완성. 둘 다 같은 인포크 계정 로그인/캐시클리어를 하므로 겹치면 세션 꼬임 방지가 목적.
- **헤더 뱃지** [public/index.html](public/index.html): `startCheckReplies()`에서 시작 시 `headerStatus`를 `답장확인 중`(인디고 배경)으로. `pollReplies()` running 분기에서도 동일 세팅(새로고침/다중 PC 동기화 대응, 페이지 로드 시 `pollReplies()` 호출됨). 종료 분기에선 **뱃지 텍스트가 '답장확인 중'일 때만** '준비'로 복귀 → 발송의 `발송 중`/`완료` 뱃지를 덮어쓰지 않음(상호 배타라 동시 점유는 없지만 페이지 로드 비동기 순서 안전장치).
- `node --check server.js` 통과. index.html은 수동 확인.

## 탭 2depth 구조화 — '인포크/메일 제안' 하위로 묶기 + '답장 확인'→'인포크 확인' 개명 (26.06.09)
인플루언서/실행/인포크 확인 세 탭을 상위 탭 '인포크/메일 제안'(1depth)의 하위 서브탭(2depth)으로 묶고, '답장 확인'을 '인포크 확인'으로 개명. 내부 식별자(`replies`, `repliesSeenAt`, `reply_runs`, `check-replies`, `checkReplies.js`)는 그대로 두고 한글 표시 텍스트만 변경.
- **UI 구조** [public/index.html](public/index.html): `.tabs`에서 인플루언서/실행/답장 확인 3탭 제거 → `<div class="tab" data-group="inpock">인포크/메일 제안</div>` 1개로 대체. 바로 아래 `#subtabs-inpock` 서브탭 바 신설(인플루언서/실행/인포크 확인, `data-panel`은 influencers/run/replies 유지). CSS `.subtabs`/`.subtab`(+hover/active, 모바일 overflow) 추가.
- **탭 전환 JS** [public/index.html](public/index.html): `onPanelEnter(panel)`로 패널 진입 후처리(배지·재로드) 공통화. `activateInpockSub(panel)` 신설 — 그룹 탭 활성+서브탭 바 표시+서브패널 활성. 1depth 핸들러는 `data-group==='inpock'`이면 서브탭 모드, 그 외엔 서브탭 바 숨김. `.subtab` 클릭 핸들러 신설. `goToRepliesTab()`→`activateInpockSub('replies')`, `goToSettings()`에 서브탭 바 숨김 1줄 추가.
- **한글 텍스트 개명(답장 확인→인포크 확인)**: [public/index.html](public/index.html)(섹션 주석/카드 타이틀/버튼/주석), [server.js](server.js)(크론 로그·API 주석·Vercel/종료 주석), [src/checkReplies.js](src/checkReplies.js)(콘솔 로그·주석), [src/selectors.js](src/selectors.js)(chat 주석), [scripts/schema.sql](scripts/schema.sql)(reply_runs 주석), [CLAUDE.md](CLAUDE.md)(개요·명령어·파이프라인·테이블·주의사항). 결과 표시의 일반 단어 "답장"(예: "N명에게서 답장", "답장 없음", "답장 온 인플루언서[리드]")은 의미상 그대로 둠.
- `node --check server.js src/checkReplies.js src/selectors.js` 통과. index.html은 수동 확인 필요(`npm run ui`).

## 자주 사용하는 문구 — 직원별 최대 3개 최상단 고정 (26.06.09)
유틸리티 > 자주 사용하는 문구에서 직원별로 문구를 📌 최대 3개까지 최상단 고정. 고정분은 목록 맨 위에 노란 카드로 모이고, 4번째 고정은 서버가 막음(`PIN_LIMIT`→400).
- **DB** [scripts/schema.sql](scripts/schema.sql): `phrases`에 `pinned boolean not null default false` 추가(create 정의 + 하단 `alter ... add column if not exists` 마이그레이션). ⚠️ 운영 Supabase는 이 ALTER 1줄 SQL Editor에서 1회 실행 필요.
- **Repo** [src/repo/phrasesRepo.js](src/repo/phrasesRepo.js): `rowToPhrase`에 `pinned`, `list` 정렬 **pinned desc→sort_order→created_at**(JSON/Supabase 양쪽). 신규 `setPinned(id, pinned)` dual-mode 추가 — 켤 때만 해당 직원 고정수 `< PIN_LIMIT(3)` 검증(자기 제외), 초과 `PIN_LIMIT`, 미존재 `NOT_FOUND`. `module.exports`에 노출.
- **Server** [server.js](server.js): `PUT /api/phrases/:id/pin`(body `{pinned}`) 신규 — 기존 `PUT /api/phrases/:id`(title/content 검증)와 분리해 핀 토글이 content 검증에 안 걸리게. `PIN_LIMIT`→400("최대 3개까지 고정"), `NOT_FOUND`→404.
- **UI** [public/index.html](public/index.html): 카드에 📌고정/고정해제 버튼(`togglePin(id,pinned)`), 고정 카드 `.phrase-card.pinned`(노란 테두리)+📌배지, 상단 "고정 N/3" 카운트. 인라인 수정 카드엔 핀 버튼 미노출. CSS `.phrase-card.pinned`/`.phrase-pin-badge`/`.phrase-pin-count`/`.btn-pin-active` 신설.
- `node --check server.js src/repo/phrasesRepo.js` 통과.

## Vercel 직원용 배포 — DB 접속/CRUD 가능하도록 (26.06.09)
ngrok(`shimmy-defame-unifier.ngrok-free.dev`)는 매크로 운영용 그대로 두고, 직원용 `unx-company-gonggu.vercel.app`에서 기존 관리 UI의 DB CRUD가 동작하도록 Vercel을 서버리스로 구성. 두 배포가 같은 Supabase를 공유 → 데이터 동기화 불필요. 원인: Vercel엔 백엔드(`/api`)가 없어서 모든 CRUD 호출이 깨졌고(`adminPassword` 때문에 401), `.env`가 gitignore라 Supabase 키도 없었음.
- [server.js](server.js): ① `authRequired`에 `if (process.env.VERCEL) return next()` — 서버리스에선 인증 스킵(직원 링크만으로 이용 + 무상태 세션 문제 회피). ② cron 2개(`0 9 * * *` 리드 리마인드 / `30 8,10,12,14,16` 답장확인)를 `if (!process.env.VERCEL){...}`로 감쌈 — 서버리스에서 cron·spawn 불가. ③ 하단 `module.exports = app` 추가하고 `app.listen`은 `if (!process.env.VERCEL)`일 때만 — @vercel/node가 Express app을 핸들러로 사용.
- [vercel.json](vercel.json) 신설(루트): `@vercel/node`로 server.js 빌드 + `routes` 전부 server.js로, `includeFiles`로 `public/**`·`settings.json` 번들(express.static·config가 fs로 읽으므로 필수). ※ `public/recommend/vercel.json`(별도 추천 카탈로그 프로젝트용)과 무관.
- [server.js](server.js) instagramScraper **lazy require** 전환: top-level `require('./src/instagramScraper')`(→`require('playwright')`)가 서버리스 로드 시점에 playwright를 끌어와 `FUNCTION_INVOCATION_FAILED` 유발. `getInstagramScraper()` 헬퍼로 호출 시점에만 require. ngrok/로컬은 호출 시 정상 로드(require 캐싱) → 동작 동일, 무영향. (checkReplies/index.js의 playwright는 spawn이라 함수 번들과 무관.)
- `node --check server.js` 통과.
- **⚠️ 사용자 수동 작업 필수**: Vercel 프로젝트 → Settings → Environment Variables에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`(로컬 `.env` 값) 추가 후 **Redeploy**. 이게 없으면 db.js가 import 시 throw(500). `VERCEL`은 Vercel이 자동 주입(=1)이라 별도 설정 불필요.

### 부족한 부분 (후속 작업 메모)
1. **직원/운영자 권한 분리 없음** — Vercel에서 인증을 통째로 스킵해 매크로 발송·계정 등 모든 탭/API가 노출됨(매크로는 spawn 불가라 실동작은 안 하지만 UI엔 보이고, 데이터 수정 API는 열려 있음). → `index.html`에서 `location.hostname` 기반으로 직원 모드 분기(발송/계정/답장확인 탭 숨김) + 서버단에서 매크로 라우트 차단 필요.
2. **이미지 업로드 불가** — multer가 `assets/` 디스크에 저장하는데 Vercel 파일시스템은 읽기전용/휘발성. 직원이 제품 사진 업로드 시 실패. → 업로드를 Supabase Storage 직행으로 변경하거나, 일단 직원 모드에서 업로드 버튼 숨김. (사용자: "이미지는 차차")
3. **인증 없음 = 공개 노출** — URL 아는 사람 누구나 CRUD. 필요 시 공유 비번 1개(서명 쿠키) 또는 Supabase Auth 추가.
4. **playwright 번들** — server.js가 instagramScraper를 top-level require → 서버리스 함수에 playwright가 포함돼 빌드가 무거움. 동작엔 무방하나, 빌드 크기 문제 시 instagramScraper를 lazy require로 전환.
5. **assets 정적 서빙** — `includeFiles`에 `assets/**` 미포함(용량). 제품 사진은 DB에 Supabase public URL로 저장돼 직접 로드되므로 보통 무관하나, `/assets/...` 직접 참조가 있으면 404. 필요 시 추가.

## 자주 사용하는 문구 — 직원별 추가/복사 탭 신설 (26.06.09)
직원을 설정에서 추가하면 📝 문구 탭이 직원별 서브탭으로 나뉘고, 각 직원이 자주 쓰는 문구를 등록·복사. 저장은 Supabase(`employees`·`phrases` 2테이블, dual-mode JSON 폴백 포함). `employees`는 향후 다른 테이블에서도 `employee_id`로 참조할 독립 범용 테이블로 둠.
- **스키마** [scripts/schema.sql](scripts/schema.sql): 파일 하단에 `employees`(id/name/sort_order/created_at) + `phrases`(id/employee_id FK on delete cascade/title/content/sort_order/created_at) + `idx_phrases_employee` 추가. `create table if not exists`라 정의 겸 마이그레이션. ⚠️ 운영 Supabase는 이 블록을 SQL Editor에서 1회 실행 필요. RLS 미적용(관리 UI 전용).
- **Repo** [src/repo/employeesRepo.js](src/repo/employeesRepo.js)·[src/repo/phrasesRepo.js](src/repo/phrasesRepo.js) 신설 — catalogsRepo 패턴 dual-mode. `list/insertOne/updateOne/removeOne`. employeesRepo는 JSON 모드 삭제 시 해당 직원 phrases.json 항목도 정리(FK cascade 흉내). phrasesRepo `list(employeeId?)` 필터, validation `EMPLOYEE_REQUIRED`/`CONTENT_REQUIRED`, 수정 시 employee_id 불변. JSON 폴백 `employees.json`/`phrases.json`.
- **Server** [server.js](server.js): 카탈로그 라우트 뒤에 `GET/POST /api/employees`, `PUT/DELETE /api/employees/:id`, `GET /api/phrases?employeeId=`, `POST /api/phrases`, `PUT/DELETE /api/phrases/:id` 추가. `NAME_REQUIRED`/`EMPLOYEE_REQUIRED`/`CONTENT_REQUIRED`→400, `NOT_FOUND`→404.
- **UI** [public/index.html](public/index.html): 설정 패널에 "직원 관리" 카드(목록+이름변경/삭제+추가). 탭 바에 `📝 문구` 탭 + `#panel-phrases` 패널(직원 서브탭 `.phrase-subtab` + 추가 폼 + 문구 카드 `.phrase-card`, 항목별 📋복사/수정/삭제). 복사·수정은 `currentPhrases`에서 id로 조회(onclick 이스케이프 회피), 복사는 기존 `copyText()`→`showToast()` 재사용. 탭 전환/설정 진입 시 `loadEmployees()` 후 렌더. CSS `.phrase-subtabs`/`.phrase-card`/`.employee-row` 신설.
- `node --check server.js src/repo/employeesRepo.js src/repo/phrasesRepo.js` 통과.

## 고아 크롬 프로세스 누적 차단 — 프로세스 트리 강제 종료 (26.06.04)
컴퓨터가 종종 꺼지는 증상의 가장 유력한 원인. Windows에서 `child.kill('SIGTERM'/'SIGKILL')`은 TerminateProcess로 변환돼 spawn된 node 자식만 죽이고, 그 node가 띄운 Playwright chromium(chrome.exe) 손자들은 고아로 남는다. 강제 종료라 자식 스크립트의 `finally{ browser.close() }`([src/index.js:211](src/index.js#L211)·[src/checkReplies.js:116](src/checkReplies.js#L116))도 실행 안 됨. "발송/답장확인 중단" 누를 때마다, 또 서버 재시작 시마다 chrome.exe 트리가 고아로 쌓여 RAM/CPU 점유 → 프리징/발열 셧다운.
- [server.js:465](server.js#L465) `killProcessTree(proc, signal)` 헬퍼 신설. win32면 `taskkill /pid <pid> /T(트리) /F(강제)`를 `stdio:'ignore'`로 spawn(실패 시 `proc.kill('SIGKILL')` 폴백), 그 외 OS는 기존처럼 `proc.kill(signal)`.
- 중단 엔드포인트 교체: [server.js](server.js) `/api/macro/stop`·`/api/replies/stop`의 `proc.kill()` → `killProcessTree()`. force 분기(즉시 null + 로그)는 유지. Windows에선 `/F`라 force 여부와 무관히 트리 강제 종료.
- 서버 종료 정리: [server.js](server.js) 하단에 `shutdownCleanup()` + `process.on('SIGINT'|'SIGTERM')` 추가. Ctrl+C/재시작 시 실행 중이던 `macroProcess`/`replyProcess` 트리를 죽이고 300ms 후 exit(중복 호출 방지 플래그). 서버가 죽으며 자식+chromium이 고아로 남던 경로 차단.
- `node --check` 통과. 참고: 인스타 분석(`instagramScraper`)은 server 프로세스 내부 인라인 실행이라 별도 spawn 없음 → shutdownCleanup의 process 종료로 함께 정리됨. ⚠️ 기존에 이미 쌓인 고아 chrome.exe는 작업관리자에서 1회 수동 정리 필요.

## 로그 무한 증가로 인한 메모리 누수 차단 — macroLogs/replyLogs 상한 (26.06.04)
컴퓨터가 종종 꺼지는 증상 점검 중 발견. [server.js](server.js)의 `macroLogs`(발송)·`replyLogs`(답장확인) 배열이 한 번도 잘리지 않아 상시 떠있는 server 프로세스 힙에 무제한 누적되던 문제. `/api/macro/status`·`/api/replies/status` 폴링마다 배열 전체를 JSON 직렬화해 메모리·CPU가 동반 상승했음. `leadsLogs`(200줄)·`instagramScraper`(300줄)는 이미 상한이 있었으나 정작 출력이 가장 많은 두 로그만 무제한이었음.
- [server.js:449](server.js#L449) `MAX_LOG_LINES = 500` 상수 + `pushMacroLog(...items)`/`pushReplyLog(...items)` 헬퍼 신설. push 후 `slice(-MAX_LOG_LINES)`로 최근 500줄만 유지(초과 시에만 재할당).
- 모든 직접 `macroLogs.push`/`replyLogs.push` 호출부를 헬퍼로 교체: 발송 stdout/stderr/close([server.js](server.js) `/api/macro/start`), 발송 중단([server.js](server.js) `/api/macro/stop`), 답장확인 stdout/stderr/close + 강제/일반 중단([server.js](server.js) `/api/replies/check`·`/api/replies/stop`), 크론 답장확인 핸들러([server.js](server.js) `30 8,10,12,14,16 ...`). `= []` 초기화는 그대로 유지.
- 상한 500은 UI 실시간 로그 가독성(최근 이력 충분)과 메모리 사이 균형값. `node --check` 통과. 별도 마이그레이션/스키마 변경 없음.

## 리드 관리 — 카톡전환 컬럼/체크박스 + 표에 메모란 노출 (26.05.27)
- **DB 스키마** [scripts/schema.sql](scripts/schema.sql): `leads` 테이블 정의에 `collaboration_converted boolean not null default false` 컬럼 추가. 파일 하단 마이그레이션 블록에 `alter table leads add column if not exists collaboration_converted boolean not null default false;` 1줄 추가. ⚠️ 운영 Supabase는 SQL Editor에서 ALTER 1줄 1회 실행 필요.
- **Repo** [src/repo/leadsRepo.js](src/repo/leadsRepo.js): `rowToLead()`에 `collaborationConverted: !!r.collaboration_converted` 추가, `normalizeIncoming()`에 `collaboration_converted: !!payload.collaborationConverted` 추가. Supabase/JSON 양 모드 자동 적용. 파일 상단 list() 반환 구조 주석도 갱신.
- **UI 모달** [public/index.html](public/index.html) `#leadModal`: "최종 결과"를 1fr/1fr grid로 감싸 우측에 카톡전환 체크박스(`#leadCollabConverted`) form-group 추가 — 보조박스 톤(연회색 보더 + 라운드 + 호버 가능 라벨). `openLeadModal()`에 복원, `saveLead()` payload에 `collaborationConverted` 포함.
- **UI 테이블** [public/index.html](public/index.html) `#leadsTable`: thead 7→9 데이터 컬럼 ("최종 결과" 뒤에 "카톡전환", "메모" 추가). `renderLeads()` tbody 매핑에 두 셀 추가 — 카톡전환은 ✅(`#16a34a`)/—(연회색)로 중앙 정렬, 메모는 `suitableProductNote`와 동일 스타일(`max-width:200px;white-space:pre-wrap;color:#6b7280;font-size:12px`). empty row `colspan="8"` → `colspan="10"`. 정렬/필터/due 강조 로직 무변경.

## 리드 관리 — 진행 중 상단 고정 + 관심 연락일 최신순 정렬 (26.05.21)
[public/index.html:2194-2200](public/index.html#L2194-L2200) `renderLeads()` 안에서 필터 후 tbody 렌더 직전에 `filtered.sort()` 추가. 1차 키 `finalStatus === 'pending' ? 0 : 1` ASC(진행 중을 위로), 2차 키 `repliedAt` DESC(`localeCompare`로 ISO 날짜 문자열 안전 비교, 빈 값은 그룹 내 맨 뒤). JS `sort`가 stable이라 동률 시 원래 순서 보존. API/repo/스키마 무변경, 60초 폴링에서도 자동 적용. 필터(전체/리마인드 필요/진행 중/완료)에도 동일 정렬 적용됨.

## 제품 목록 textarea 높이 고정 (26.05.20)
[public/index.html:1068-1073](public/index.html#L1068-L1073) 제품관리 > 제품 목록 카드의 두 textarea에 `rows` 확대 — "제품 특징 (USP)" `rows="3"→"8"`, "제안 / 메일 내용" `rows="4"→"15"`. 공통 `min-height:80px`/`resize:vertical` 스타일은 유지되어 사용자가 더 늘릴 수 있음. 다른 textarea(서명/메모/후킹/leads 등) 무영향.

## 추천 카탈로그 공개 페이지 — 로그인 없이 접근 허용 (26.05.20)
[server.js:43](server.js#L43) `authRequired` 미들웨어에 `if (req.path.startsWith('/recommend')) return next();` 한 줄 추가. `/favicon.ico` 예외 패턴 그대로. ngrok 경유 시 `/recommend/?c=<code>`가 `/login`으로 리다이렉트되어 인플루언서가 카탈로그 못 보던 문제 해결. 노출 범위는 `/recommend/` 폴더 정적 4개 파일 + Supabase `get_catalog_by_code` RPC(정확한 code 알아야 1건씩 조회) — 관리 UI/`/api/*`/`/assets/*`는 인증 유지. Vercel 분리 배포본과 동일 정책으로 맞춤.

## 추천 카탈로그 모달 — divider 마진 부족 (26.05.20)
[public/recommend/style.css:220](public/recommend/style.css#L220) 셀렉터 `.modal-section .divider` → `.modal-body hr.divider`로 교체. 기존 셀렉터는 후손 매칭이라 형제로 렌더되는 `<hr class="divider">`([public/recommend/catalog.js:152](public/recommend/catalog.js#L152))를 못 잡아서 브라우저 기본 hr 스타일로 떨어지던 문제 해결. 마진도 20px → 28px로 확대해 "콘텐츠 포인트"와 "제안 내용" 섹션 사이 시각 분리 강화.

## URL 복사 후 "복사완료!" 토스트 (26.05.20)
[public/index.html:199](public/index.html#L199) `.toast` CSS 신설(하단 중앙 고정, fade+slide 0.2s 트랜지션). [public/index.html:2400](public/index.html#L2400) `showToast(message)` 헬퍼 — 동일 노드 재사용, 1.6s 후 자동 hide, 연속 호출 시 타이머 리셋. `copyText()`의 success 콜백을 silent → `showToast('복사완료!')`로 교체. 카탈로그 목록 [복사], 모달 [📋 URL 복사], `copyResultUrl()` 모두 자동 적용.

## 기존 카탈로그 수정 — 제품 목록 추가/순서조정 (26.05.20)
- Repo: [src/repo/catalogsRepo.js](src/repo/catalogsRepo.js)에 `updateOneJson`/`updateOneSupabase`/`updateOne` 추가. `code`/`created_at`/`view_count`/`viewed_at` 보존, `title`/`influencer_nickname`/`lead_id`/`product_ids`만 갱신. validation은 insertOne과 동일(`NICKNAME_REQUIRED`, `PRODUCTS_REQUIRED`), Supabase NOT_FOUND(`PGRST116`)는 404 매핑.
- Server: [server.js](server.js) `PUT /api/catalogs/:id` 추가. 응답 `{ ok, catalog }`.
- UI: [public/index.html](public/index.html) 카탈로그 테이블 행에 `[수정]` 버튼 추가([복제]/[삭제] 사이). `openCatalogModal(sourceId, mode)`로 시그니처 확장 — `mode='edit'`이면 `editingCatalogId`에 id 저장, 제목·닉네임·leadId·`selectedProductIds` prefill, 모달 헤더("카탈로그 수정")·푸터 버튼("수정") 라벨 토글. `submitCatalog()`가 `editingCatalogId`에 따라 PUT/POST 분기. `closeCatalogModal()`에서 `editingCatalogId = null` 리셋. URL은 유지되어 인플루언서에게 재전달 불요.

## 카탈로그 생성·수정 결과 박스 가독성 개선 — 모달 내부 오버레이 (26.05.20)
- CSS: [public/index.html:191](public/index.html#L191) 기존 `.catalog-result-box` 자리에 `.catalog-result-overlay` + `.catalog-result-card` + 부속 클래스 신설. 오버레이는 `position:absolute; inset:0; background:rgba(0,0,0,0.6); z-index:2`로 모달 내부 풀커버, 가운데 흰 카드(✓ 아이콘 + 타이틀 + URL + 복사/닫기 버튼) 배치. `fadeIn` 0.18s 애니메이션.
- HTML: [public/index.html:2705](public/index.html#L2705) `#catalogModal` 컨테이너 `position:relative; overflow:hidden`로, 내부 폼은 `overflow-y:auto` 스크롤 div로 분리. `#catalogResultBox`는 컨테이너 직계 자식 오버레이로 이동. 헤더에 `#catalogModalTitle`, 제출 버튼에 `#catalogSubmitBtn`, 결과 타이틀에 `#catalogResultTitle` ID 부여 — 신규/수정 모드별 텍스트 토글에 사용.
- 결과 박스가 뜨면 폼·제품 패널은 그대로 두되 어두운 오버레이에 가려져 결과 카드로 시각 포커스 이동.

## 인플루언서 붙여넣기 — 두 번째 컬럼 콤마 분리 다중 행 (26.05.20)
[public/index.html:1427-1450](public/index.html#L1427) `pasteArea` paste 핸들러: 탭 분리된 라인에서 두 번째 컬럼(`profileUrl`)이 `,`로 나열되어 있으면 trim 후 각 값을 같은 `nickname`/`productName`으로 다중 행 push. 예) `nick\temail@x.com, link.inpock.co.kr/xxx\tproduct` → 이메일 1행 + URL 1행. URL 내부 `/`는 건드리지 않음. 콤마 분리 라인(탭 없음)은 기존 동작 그대로.

## 추천 탭 검색 input 높이 통일 (26.05.20)
[public/index.html:47](public/index.html#L47) 공통 입력 필드 CSS 셀렉터에 `input[type="search"]` 추가. `#catalogsSearch`(닉네임/제목 검색), `#catalogSearch`(카탈로그 모달 좌측 제품 검색) 두 input이 브라우저 기본 스타일로 렌더되던 문제 해결 — 다른 input과 동일한 padding(10px 12px)/border/높이로 정렬.

## 추천 카탈로그 페이지 — 인플루언서별 큐레이션 공유 링크 (26.05.18)
관리자가 인플루언서별로 제품을 큐레이션해서 공개 URL 발급 → 인플루언서가 갤러리+모달 형식 카탈로그 열람. 시스템 PC와 무관하게 항상 떠있도록 Vercel 분리 배포 구조. 한 인플루언서에 N개 카탈로그 생성 가능(차수별/시즌별).

- **DB 스키마** [scripts/schema.sql](scripts/schema.sql) — 11번 섹션 추가:
  - `catalogs` 테이블: `id`, `code text unique`, `title`, `influencer_nickname not null`, `lead_id int -> leads(id) on delete set null`, `product_ids jsonb not null default '[]'` (드래그로 정한 순서 그대로 저장 → 렌더 시 그 순서 보존), `view_count int default 0`, `viewed_at`, `created_at`.
  - 인덱스: `idx_catalogs_code(code)`, `idx_catalogs_nickname(influencer_nickname)`.
  - **`get_catalog_by_code(p_code text) returns json` RPC** (SECURITY DEFINER, search_path public): code 일치 시 `view_count+=1`, `viewed_at=now()`, `product_ids` 순서대로 `products` + `product_photos` join해서 JSON 1건 반환. 미존재 시 null. `grant execute ... to anon` 으로 anon 키만 호출 가능.
  - **RLS 활성화**: `catalogs`/`products`/`product_photos` 모두 `enable row level security`. 정책 없음 = anon 직접 SELECT 차단. service_role(서버)는 RLS 우회하므로 기존 관리 UI/매크로 무영향.
  - ⚠️ 운영 Supabase는 SQL Editor에서 11번 섹션 + 3개 ALTER ENABLE RLS 블록 1회 실행 필요.

- **Repo 레이어** [src/repo/catalogsRepo.js](src/repo/catalogsRepo.js) 신규 (leadsRepo 패턴):
  - `list()` / `insertOne(payload)` / `removeOne(id)`. `update`는 v1 범위 외 — 수정 필요 시 삭제 후 재생성(URL 재발급) 워크플로우.
  - `generateCode()`: `crypto.randomBytes(5).toString('base64')` → URL-safe(`-`, `_`)로 치환 후 6자.
  - `insertOneSupabase()`: unique 충돌 시 5회 재시도(`error.code === '23505'`).
  - dual-mode: `config.USE_SUPABASE` 분기. JSON 폴백 `catalogs.json`. ⚠️ JSON 모드에선 공개 페이지가 동작 안 함(RPC가 Supabase 의존).

- **Server API** [server.js](server.js):
  - `GET /api/catalogs` / `POST /api/catalogs` / `DELETE /api/catalogs/:id`. 인증 미들웨어 뒤(authRequired).
  - `POST`는 `NICKNAME_REQUIRED` → 400, `PRODUCTS_REQUIRED` → 400. body: `{title, influencerNickname, leadId?, productIds[]}`.

- **관리자 UI** [public/index.html](public/index.html):
  - 탭바 `리드 관리` 다음에 `📦 추천` 탭 추가. 탭 진입 시 `loadCatalogs()` 호출 + 60초 폴링.
  - 신규 `panel-catalogs`: 닉네임/제목 검색 input + 정렬 select(`최근순` / `닉네임 그룹화순`). 닉네임순일 때 같은 닉네임 row는 `↳` prefix로 표시.
  - 테이블 7컬럼: 닉네임 | 제목 | 제품수 | 조회수 | URL(copy버튼) | 생성일 | [복제]/[삭제].
  - **신규 모달 `#catalogModal`** — 2패널 좌우 구조:
    - 상단: 제목 input(placeholder `"말랑맘님 - 1차 공구 제안"`, 비우면 `{닉네임}님 공동구매 제안` 자동), 리드 select(선택 시 `lead_id` + 닉네임 자동 채움), 닉네임 input(이미 N개 존재 시 안내 박스 자동 노출).
    - 좌패널: 검색 input + 전체 제품 list. 클릭으로 우패널에 추가(중복 불가).
    - 우패널: 선택된 제품 list. **Sortable.js**(CDN `sortablejs@1.15.2`)로 드래그 정렬. `data-pid` 기반 DOM 순서 → `selectedProductIds` 동기화.
    - 생성 성공 시 모달 안에 URL 표시 + `[📋 복사]` 버튼. 닫으면 목록 갱신.
  - **[복제] 동작**: 기존 카탈로그 클릭 → 같은 닉네임/제품으로 prefill, 제목에 ` (복사)` 자동 추가. 차수별 변형용.
  - **공개 URL 설정** — 설정 탭에 "추천 카탈로그 공개 URL" 카드 추가. Vercel 배포 도메인 저장. `loadSettings()`에서 `window.CATALOG_PUBLIC_BASE_URL` 갱신. 미입력 시 `${location.origin}/recommend/` 폴백.

- **공개 카탈로그** — `public/recommend/` 신규 폴더 (Vercel 분리 배포):
  - [public/recommend/index.html](public/recommend/index.html): 갤러리 hero + 그리드 + 모달 컨테이너. `<meta name="robots" content="noindex,nofollow">`.
  - [public/recommend/style.css](public/recommend/style.css): 모바일 우선(2-col → 480px 미만은 1-col), 스크린샷 톤(흰 카드 + 호버 lift).
  - [public/recommend/catalog.js](public/recommend/catalog.js): URL `?c=<code>` 또는 `?code=<code>` 파싱 → supabase-js CDN(`@supabase/supabase-js@2`)으로 `rpc('get_catalog_by_code')` 호출 → 카드 렌더. 카드 클릭 시 모달(큰 사진 + 인스타 공구 예시 링크 + 제품 상세 페이지 링크 + 콘텐츠 포인트(USP) + 제안 내용(offerMessage) + 추천 연령). ESC + 닫기 버튼.
  - [public/recommend/config.js](public/recommend/config.js): `window.SUPABASE_URL` / `window.SUPABASE_ANON_KEY` 플레이스홀더. 사용자가 anon key 1회 입력.
  - [public/recommend/vercel.json](public/recommend/vercel.json): `/c/:code` → `/index.html?c=:code` rewrite + `X-Robots-Tag: noindex,nofollow` 헤더.

- **로컬 테스트**: `server.js`의 `app.use(express.static(path.join(__dirname, 'public')))`이 자동으로 `/recommend/`를 서빙. `config.js`에 anon 키 채우면 `http://localhost:3000/recommend/?c=<code>`로 바로 테스트 가능.

- **Vercel 배포 절차**:
  1. GitHub에 푸시.
  2. Vercel → New Project → 본 리포 선택 → Framework `Other` → Root Directory `public/recommend` → Deploy.
  3. 첫 Deploy 후 `https://<프로젝트명>.vercel.app/?c=<code>` URL 확보.
  4. 관리 UI 설정 → "추천 카탈로그 공개 URL"에 `https://<프로젝트명>.vercel.app/` 입력 → 저장. 이후 발급되는 모든 URL이 이 도메인을 사용.
  5. ⚠️ **anon key 확보**: Supabase Dashboard → Project Settings → API → "anon public" 키 복사 → `public/recommend/config.js`에 채워서 푸시.

- **알려진 한계 / 후속 작업**:
  - **6자 code의 추측 위험**: ≈37억 조합이라 brute-force 비용 높지만, anon RPC가 rate limit 없으면 이론상 가능. 우려 시 후속에서 8자 이상으로 확장 또는 PostgREST rate limit 적용.
  - **카탈로그 수정 미지원**: v1은 생성/삭제만. 제품/순서 바꾸려면 삭제 후 재생성(URL 재발급). 사용 패턴 보고 후속에서 PUT 추가 검토.
  - **JSON 롤백 모드에선 공개 페이지 동작 안 함**: `get_catalog_by_code` RPC가 Supabase 의존. 롤백 시 관리 UI에서는 CRUD되지만 공유 URL은 죽음.
  - **가격 정보 미노출**: products 테이블에 price 컬럼이 없어 카드/모달에 가격 표시 안 함. 필요 시 후속에서 컬럼 추가.

## 모달 바깥 클릭으로 닫히지 않게 — ESC / X 버튼만 닫기 (공통 UI) (26.05.14)
실수로 backdrop 클릭해 입력 내용이 날아가는 일이 잦아, 4개 모달 모두 ESC 키와 우상단 ✕ 버튼으로만 닫히도록 통일.

- 대상: [public/index.html](public/index.html)의 `#manualSendModal`, `#hookingModal`, `#leadModal`, `#quickProductModal`.
- wrapper 4개의 `onclick="if(event.target===this)close...()"` 속성 제거 → 바깥 클릭 무반응. 공통 셀렉터용으로 `class="modal-backdrop"` 부여 (기존 inline style 그대로).
- 공통 ESC 핸들러 1개 추가 (스크립트 끝):
  - `MODAL_CLOSERS` 맵으로 id → close 함수 매핑.
  - `keydown`에서 `Escape` 감지 시 `display !== 'none'`인 `.modal-backdrop`을 수집해 **마지막(가장 위)** 1개만 닫음. 중첩 모달 대비.
  - `e.stopPropagation()`로 다른 ESC 리스너 간섭 차단.
- 비변경: X / 취소 / 저장·적용 버튼 로직, CSS 모두 그대로.

## 리드 관리 탭 신설 — 답장 온 인플루언서 추적 (26.05.12)
답장 확인 우측에 신규 탭 "리드 관리". 답장 온 인플루언서를 기록 → 제안서 발송일+3일 자동 리마인드 → 어울릴만한 제품/최종 결과까지 한 탭에서 관리.

- **DB 스키마** [scripts/schema.sql](scripts/schema.sql):
  - 신규 테이블 `leads` 추가. 컬럼: `id serial pk`, `nickname text not null`, `profile_url text`, `interested_product_name text` (FK 안 검 — 제품 리네임/삭제와 분리), `suitable_product_note text`, `replied_at date`, `proposal_sent_at date`, `remind_at date`, `final_status text check in ('pending','거절','공구진행','무응답') default 'pending'`, `notes text`, `created_at`, `updated_at`.
  - 인덱스 `idx_leads_remind (final_status, remind_at)` — due 리마인드 조회 가속.
  - ⚠️ **운영 Supabase는 SQL Editor에서 아래 DDL 1회 실행 필요**:
    ```sql
    create table if not exists leads (
      id                       serial      primary key,
      nickname                 text        not null,
      profile_url              text,
      interested_product_name  text,
      suitable_product_note    text,
      replied_at               date,
      proposal_sent_at         date,
      remind_at                date,
      final_status             text        not null default 'pending'
                               check (final_status in ('pending','거절','공구진행','무응답')),
      notes                    text,
      created_at               timestamptz not null default now(),
      updated_at               timestamptz not null default now()
    );
    create index if not exists idx_leads_remind on leads(final_status, remind_at);
    ```

- **Repo 레이어** [src/repo/leadsRepo.js](src/repo/leadsRepo.js) 신규 (productsRepo 패턴):
  - `list()` / `insertOne()` / `updateOne(id)` / `removeOne(id)` / `listDueReminders(today)`. `ALLOWED_STATUSES` export.
  - Supabase + JSON 분기 (`config.USE_SUPABASE`). JSON 폴백 경로: `leads.json` ([config.js](config.js) `PATHS.leads` 신규).
  - `normalizeIncoming()`이 `remind_at` 미지정 시 `proposal_sent_at + 3일` 자동 보정 (서버측 이중 안전).
  - `final_status` 화이트리스트 외 값은 `sanitizeStatus()`가 `'pending'`으로 강제.
  - JSON 모드: id 자동 부여, `created_at` ISO 문자열로 저장, 최신순 정렬.

- **Server API** [server.js](server.js):
  - `GET /api/leads`, `POST /api/leads` (nickname 필수), `PUT /api/leads/:id`, `DELETE /api/leads/:id`.
  - `GET /api/leads/reminders-due` — `{count, leads, logs}` 반환.
  - node-cron 매일 `0 9 * * *` — `checkLeadReminders()` 호출. 결과를 `leadsLogs` 버퍼(최근 200줄) + 콘솔에 출력. 텔레그램/이메일 푸시는 보유 채널 미정으로 이번 범위 제외, 함수 분리해 후속에서 1줄 추가만으로 푸시 붙일 수 있도록 함.

- **UI** [public/index.html](public/index.html):
  - 탭바 `panel-replies` ↔ `panel-instagram` 사이에 `<div class="tab" data-panel="leads">리드 관리 <span class="leads-due-badge">N</span></div>` 추가. due 카운트 0이면 뱃지 숨김.
  - 신규 `<div class="panel" id="panel-leads">`:
    - `[+ 리드 추가]` 버튼 + 필터 select(전체/리마인드 필요/진행 중/완료).
    - due 카운트 > 0이면 상단에 노란 안내 박스.
    - 테이블 8컬럼: 닉네임 | 관심 제품 | 제안서 발송일 | 관심 연락일 | 리마인드 필요일 | 어울릴만한 제품 | 최종 결과 | [수정]/[삭제].
    - due 행은 `.due` 클래스(`#fef3c7` 배경 + 빨간 좌측 막대).
  - 리드 편집 모달 `#leadModal` — hookingModal 패턴. 폼: 닉네임 / 프로필URL / 관심제품(`<select>`에서 products로부터 옵션 동적 생성, 메모리에 없는 이름은 "(목록 외)"로 보존) / 관심 연락일 / 제안서 발송일 / 리마인드 필요일 / 최종 결과 / 어울릴만한 제품(textarea) / 메모.
  - 폼 인터랙션: `proposal_sent_at` 변경 시 `remind_at`이 비어있거나 `dataset.auto==='1'`이면 +3일 자동 채움. 사용자가 `remind_at`을 직접 수정하면 `auto` 해제 → 이후 발송일 바뀌어도 덮어쓰지 않음.
  - `loadLeads()` 초기 호출 + 60초 폴링 + 탭 진입 시 즉시 재로드.
  - CSS: `.leads-due-badge`(빨간 칩), `.leads-table tr.due`, `.lead-status-*` 4종(pending/거절/공구진행/무응답 컬러칩).

- **CLAUDE.md**: 데이터 소스 섹션 — 테이블 수 9→10, `leads` 라인 추가, JSON 폴백 스키마에 `leads.json` 라인 추가, `influencers.status` 옵션에 `sending` 표기 보정.

- **알려진 한계 / 후속 작업**:
  - 답장 확인 탭과의 자동 연동 없음 — 1차는 수동 입력 전용. `checkReplies.js`는 sendbird-badge 카운트만 알지 누가 답장했는지는 모르므로 후속에서 "리드로 등록" 버튼/플로우 검토.
  - 어울릴만한 제품(`suitable_product_note`)은 자유 텍스트 필드 — 사용 패턴 보고 향후 구조화(다중 select, 우선순위 등) 검토.
  - 리마인드 알림은 서버 콘솔 + UI 뱃지·강조뿐. 텔레그램/이메일 푸시 채널 결정 후 `checkLeadReminders()` 내부에 호출 1줄 추가하면 됨.

## 이메일 발송도 닉네임 == 예시 주인 계정이면 skip (26.05.06)
인포크 경로 skip 게이트를 이메일 경로에도 동일하게 적용. 인플루언서 닉네임과 `product.announceExampleOwner` 비교(양쪽 `trim().toLowerCase()`).
- [src/index.js](src/index.js) 이메일 루프, `productMap.get(inf.productName)` 직후 `DRY_RUN` 분기 직전에 게이트 추가.
- 매칭 시 `[건너뜀] {nickname}: 예시 계정과 동일` 로그 + `totalFailed++` + `appendFailed({error:'예시 계정과 동일'})` + `continue`. `markSending`/`sendMail`/속도제한대기 미호출.
- `announceExampleOwner` 비어있으면 통과(정상 발송).
- DRY-RUN에서도 동일 skip — 인포크 경로와 일관.
- 인포크·이메일 양 경로에서 동일 사유 코드(`'예시 계정과 동일'`)로 실패 목록 등재 → UI "재발송 등록" 자연 동작.

## 참조자 이메일 빈값 저장 시 하드코딩 폴백이 적용되는 버그 (26.05.06)
설정에서 BCC를 비우면 발송 메일에도 BCC 빠지고, 값을 채워 저장하면 그 주소로 BCC 들어가도록 수정.
- [config.js:49](config.js#L49) MAIL_BCC getter의 하드코딩 폴백(`'ym.jung@undefiancecorp.com'`) 제거 → `loadSettings().mailBcc || ''` 로 변경.
- [src/emailSender.js](src/emailSender.js) `sendMail()`: `mailOptions` 객체를 먼저 만들고 `if (config.MAIL_BCC) mailOptions.bcc = config.MAIL_BCC;` 로 조건부 부착. nodemailer에 빈 문자열 bcc가 전달되지 않게.
- 인포크(Playwright) 경로는 BCC와 무관 → 영향 없음.

## 인포크 발송 — 닉네임 == 예시 주인 계정이면 skip (26.05.06)
제품의 "예시 주인 계정"(`announceExampleOwner`)과 인플루언서 닉네임이 동일하면 인포크 경로에서 발송 중단, 실패 사유 `'예시 계정과 동일'`로 실패 목록에 노출(사용자 검토 후 수동 처리).
- [src/index.js](src/index.js) 인포크 메인 루프, `queue.shift()` 직후 `markSending` 직전에 게이트 추가.
- 비교: 양쪽 `trim().toLowerCase()` 후 정확매칭. `announceExampleOwner` 비어있으면 게이트 통과(정상 발송).
- 매칭 시 `appendFailed({...influencer, error:'예시 계정과 동일'})` + `totalFailed++` + `continue` — `markSending`/`sendProposal`/`incrementSendCount` 미호출, 슬롯·주간카운터 영향 없음.
- 적용 범위: 인포크 경로 한정. 이메일 경로/repo/스키마/UI 변경 없음.
- DRY-RUN에서도 동일하게 skip.
- UI 노출: 기존 실패 흐름(`influencersRepo.markFailed` → "확인 필요"/실패목록) 재사용 — "재발송 등록" 버튼 자연 동작.

## 인스타분석 — 로그인 세션 안정화 (launchPersistentContext) (26.05.04)
storageState 파일 캐시가 인스타 쿠키 로테이션을 못 잡아서 매번 재로그인되던 문제 해결. 디렉토리 단위 persistent context로 전환.
- [src/instagramScraper.js](src/instagramScraper.js):
  - `STATE_PATH`(파일) → `PROFILE_DIR`(`.instagram-profile/` 디렉토리)로 교체.
  - `chromium.launch()` + `browser.newContext({ storageState })` → `chromium.launchPersistentContext(PROFILE_DIR, opts)` 단일 호출로 통합. 쿠키·localStorage·IndexedDB·서비스워커가 디스크에 자동 동기화돼서 쿠키 로테이션도 흡수됨.
  - `launchPersistentContext`는 기본 페이지 1개를 자동 오픈 → `context.pages()[0]` 재사용.
  - `ensureLoggedIn(page, creds)` 시그니처 단순화 — context 인자 제거, storageState read/write 분기 전부 제거. URL이 `/accounts/login`이면 `login()`, 아니면 그대로 통과.
  - `runAnalysis()` finally: `context.close()`만 (browser 참조 폐기).
- [.gitignore](.gitignore): `.instagram-state.json` → `.instagram-profile/` 로 교체.
- 기존 `.instagram-state.json` 파일은 코드가 더 이상 안 읽으니 자연 폐기 (수동 삭제 가능).

## 인스타그램 URL → 평균 릴스 통계 조회 (부가기능) (26.05.04)
인플루언서 사전 검토용. 인스타 프로필 URL 입력 → 최근 20개 릴스의 평균 조회수/좋아요/댓글 산출.
- **2개 모드 버튼**:
  - `⚡ 빠른 분석 (조회수만)` — 릴스 그리드에서 카드 텍스트만 파싱(~1분).
  - `전체 분석 (조회수+좋아요+댓글)` — 카드 1개씩 상세 페이지 진입(~5-8분).
- **신규** [src/instagramSelectors.js](src/instagramSelectors.js) — 로그인/프로필/릴스 페이지 셀렉터 + post-login 모달 닫기 텍스트 후보. 인포크 [src/selectors.js](src/selectors.js) 패턴.
- **신규** [src/instagramScraper.js](src/instagramScraper.js):
  - 모듈 레벨 `currentJob` 싱글톤 — 동시 1건만 실행. server.js가 inline 호출(자식 프로세스 spawn 안 함).
  - `startAnalysis({ profileUrl, mode, count = 20 })` / `getStatus()` / `isRunning()` export.
  - 흐름: chromium launch (`config.HEADLESS` 따름) → storageState 캐시 시도 → `instagram.com/`로 검증 → 필요 시 로그인 → `/{username}/reels/` → 비공개 체크 → 카드 수집(스크롤 최대 8회) → 모드별 처리.
  - 모드 'views': 각 카드 내 모든 span 텍스트 중 숫자 후보를 파싱, 최댓값을 조회수로 채택(좋아요 등 작은 숫자 배제).
  - 모드 'full': 카드별 상세 진입 → og:description 메타 정규식 파싱(우선), 실패 시 `main` innerText 정규식 fallback. 조회수는 detail에서 못 잡으면 grid 폴백.
  - `parseAbbreviatedNumber()`: `1.2K`/`1.2M`/`1.2만`/`1.2억`/`1,234` 모두 정수 정규화.
  - `parseUsername()`: URL 또는 단일 username (`@` prefix 허용) 모두 수락.
  - 로그 누적 (`currentJob.logs`, 최근 300줄) — UI 로그 영역에 노출.
  - 로그인 세션 캐시: `.instagram-state.json` (gitignore 추가). 재로그인 비용 절감.
- [server.js](server.js):
  - `POST /api/instagram/analyze` — body `{ profileUrl, mode: 'views'|'full' }`. `ALREADY_RUNNING` → 409, validation 실패 → 400.
  - `GET /api/instagram/status` — 폴링용. `currentJob` 그대로 반환(없으면 `{status:'idle'}`).
- [public/index.html](public/index.html):
  - 탭바에 `📊 인스타분석` 추가 + `panel-instagram` 패널.
  - URL input + 빠른분석/전체분석 버튼 2개 + 소요시간 안내 텍스트.
  - 진행 상태 박스(스피너 + currentStep + `진행: N/20`).
  - 결과 카드: stat-card 톤. 모드 A는 1개(조회수), 모드 B는 3개(조회수/좋아요/댓글). 각 카드에 샘플 수 부기.
  - 실패 시 빨간 에러 박스. 실행 로그는 `<details>`로 접힘.
  - `syncInstaRunning()` 초기 호출 — 다른 탭/PC에서 실행 중이면 폴링 재개, 직전 결과 있으면 표시.
  - `fmtInstaNum()` 표시 포맷: `1.2M` / `1.2만` / `1.2K`.
  - 폴링 1.5초 주기. 완료/실패 시 폴링 중단 + 버튼 잠금 해제.
  - 설정 패널에 "인스타분석 계정" 카드 신설 (외부 접속·실행 설정 카드 아래). ID/비번 입력 + 저장. 비번 빈값 저장 시 기존 값 유지(부분 업데이트). `loadSettings()`가 username 표시 + 저장된 비번 있으면 placeholder 변경.
- [.gitignore](.gitignore): `.instagram-state.json` 추가.
- **알려진 제약**:
  - 인스타 DOM은 자주 바뀌므로 셀렉터/정규식이 깨질 수 있음 → [src/instagramSelectors.js](src/instagramSelectors.js) 한 곳만 수정 + 스크래퍼의 strategies 보강.
  - 첫 로그인 시 인스타가 챌린지(2FA/캡차) 띄울 가능성 — 로그가 챌린지 URL을 보여주면 수동으로 한 번 해당 계정으로 인스타 로그인해서 챌린지 통과 후 재시도.
  - 비공개 계정은 데이터 못 가져옴(에러 반환).
  - 빈번 사용 시 계정 잠김 위험 → 적당히 사용.

## 제품 저장 — 카드 단위로 (전체 products PUT 폐기) (26.04.29)
저장 버튼이 해당 카드 1건만 DB 반영. 다른 카드 미완성이 다른 카드 저장 막던 구조 해소. "+ 제품 추가"는 메모리 stub UX 유지(첫 저장에서 insert 분기).
- [src/repo/productsRepo.js](src/repo/productsRepo.js):
  - `listSupabase` 반환에 `id` 추가, `listJson`은 `id=name` 부여(JSON 모드는 name이 unique).
  - 공용 `toRow(product)` / `replacePhotosSupabase(productId, photos)` 헬퍼 신설.
  - `insertOneSupabase` 사진 처리 추가(photos 배열 있으면 product_photos 같이 insert).
  - `insertOneJson` 반환에 `id=name` 포함.
  - `updateOne` / `removeOne` 신설(Supabase + JSON 양 모드). Supabase update는 NOT_FOUND(`PGRST116`) 표준화. JSON update는 이름 충돌 시 `DUPLICATE_NAME`.
  - `replaceAllSupabase`는 마이그레이션용으로 그대로 유지.
- [server.js](server.js):
  - 신규 `POST /api/products` (정통 신규 추가, 풀 페이로드).
  - 신규 `PUT /api/products/:id` (단건 update).
  - 신규 `DELETE /api/products/:id` (단건 삭제).
  - 공용 `validateProductBody()` — 5개 필수(name/brandName/productName/category/campaignType). USP/offerMessage 제외(빠른추가 row 호환).
  - 기존 `PUT /api/products` (replaceAll)은 마이그레이션 호환용으로 유지.
- [public/index.html](public/index.html):
  - `saveProducts()` → `saveOneProduct(i)`. 카드 1건만 검증 후 id 유무로 POST/PUT 분기. 응답에서 id 갱신(JSON 모드 리네임 호환). 성공 시 dirty clear + renderProducts(뱃지 갱신).
  - `removeProduct(i)`: confirm 통과 시 즉시 `DELETE /api/products/:id` 호출 후 splice(이전엔 splice만 + 저장버튼 의존). id 없는 stub은 splice만. openProductIdx 보정.
  - `addProduct()`: 메모리 stub(id 없음) 유지 + 신규 카드를 즉시 dirty 마킹.
  - 카드별 dirty 추적: 전역 `body.products-dirty` → `WeakSet dirtyProducts`로 product 객체 참조 추적. `markProductDirty(p)` / `clearProductDirty(p)` 헬퍼는 직접 DOM 클래스 토글(re-render 안 해서 입력 포커스 보존).
  - CSS: `body.products-dirty .dirty-indicator` → `.product-card.dirty .dirty-indicator`.
  - `productsList` input/change 위임: `closest('.product-card')` 로 카드 인덱스 추출 후 그 product만 dirty 마킹.
  - 저장 버튼 onclick: `saveProducts()` → `saveOneProduct(${i})`.
- 호환성: list()에 id가 추가됐지만 [src/index.js](src/index.js)·[scripts/testProductsRepo.js](scripts/testProductsRepo.js)는 list()를 readonly로만 사용 → 무영향.

## 빠른추가 / 이미지 없음 product-card 시각 표시 (26.04.29)
제품 카드 한눈에 식별. USP 비어있음 = "빠른추가", photos 비어있음 = "이미지 없음".
- [public/index.html](public/index.html) CSS:
  - `.product-card`에 `position:relative` 추가(absolute 뱃지 기준점).
  - `.product-card.needs-attention { border-color:#a78bfa }` (연보라). `.editing`이 cascade 뒤라 펼친 상태에선 인디고 보더 우선.
  - `.card-badges`: 카드 우측 상단 absolute(`top:20px; right:20px`), `pointer-events:none`로 클릭은 header로 패스스루(닫힌 카드 토글 보존).
  - `.card-badge.badge-quick`: 보라톤 `#ede9fe / #6d28d9 / #c4b5fd`.
  - `.card-badge.badge-no-photo`: 파랑톤 `#dbeafe / #1d4ed8 / #93c5fd`.
- [public/index.html](public/index.html) `renderProducts()`:
  - `isQuick = !p.usp`, `noPhoto = !(p.photos && p.photos.length > 0)` 카드별 산출.
  - `needs-attention` 클래스 토글, 카드 div 첫 자식으로 `.card-badges` 마크업 조건부 렌더.
- 룰: USP 비어있음 단일 조건(빠른추가 시그니처와 매칭, 일반 추가에서 USP 안 채운 미완성도 동일 노출).
- 서버/repo/스키마 변경 없음.

## 빠른 제품 추가 기능 (26.04.29)
브랜드명·제품명만 입력해서 DB에 단건 즉시 추가. 관리명=제품명. 캠페인유형·카테고리는 기본값 미리 채움.
- [public/index.html](public/index.html):
  - actions-bar 버튼 순서 `검색 | ⚡ 빠른 추가 | + 제품 추가`로 변경.
  - 모달 `#quickProductModal` 추가 — 브랜드명/제품명 input 2개 + `[취소]`/`[추가]` + ✕ + 배경 클릭 닫기. hookingModal과 같은 inline 스타일.
  - 함수 `openQuickProductModal()` / `closeQuickProductModal()` / `applyQuickProductModal()` 신설. apply는 빈 값 차단 → 메모리 `products`에서 `name` 매칭으로 사전 중복 검사 → `POST /api/products/quick` → 성공 시 `loadProducts()` + 신규 카드 인덱스 찾아 `openProductIdx` 펼침. 실패 시 alert.
- [server.js](server.js): `POST /api/products/quick` 엔드포인트. body `{brandName, productName}` 검증 → `productsRepo.insertOne({name=productName, brandName, productName, campaignType:'공동구매', category:'육아·키즈', hookingPhrases:[]})`. 중복은 409로 매핑.
- [src/repo/productsRepo.js](src/repo/productsRepo.js): `insertOne(product)` 추가, 양 모드.
  - Supabase: `insert(row).select().single()`. error.code='23505'는 `DUPLICATE_NAME` 표준화 throw.
  - JSON: 동일 name 사전 체크 후 unshift + jsonSave.
  - exports에 추가.
- 스키마 변경 없음 — `products.name` unique constraint가 2차 방어선.
- 정렬 보정: [src/repo/productsRepo.js](src/repo/productsRepo.js) `listSupabase` 정렬을 `id ASC` → `created_at DESC, id ASC`로 변경. 빠른 추가는 단건 insert라 신규 row가 가장 큰 id를 받아 맨 아래로 가던 문제 해결. replaceAll 일괄 insert는 같은 트랜잭션 → 동일 created_at → id ASC 타이브레이커로 메모리 순서 보존.


## 주간 카운트 증감 — 실수 방지 4단계 흐름 (26.04.29)
실수 클릭 방지용 게이트. 평소엔 `[수동발송처리]` 버튼만, 모달 확인 후에만 ±1/수정완료 노출.
- [public/index.html](public/index.html):
  - CSS: `.manual-send-btn` (보조 보라톤 outline), `.done-btn` (보라 fill) 추가.
  - HTML: `</body>` 직전 `#manualSendModal` 추가 — 본문 "수동으로 인포크를 보내셨습니까?", `[취소]`/`[확인]` 버튼 + 배경 클릭 닫기. hookingModal과 같은 inline 스타일 패턴.
  - JS: 전역 `manualEditMode` 추가. `openManualSendModal()` / `closeManualSendModal()` / `confirmManualSend()` / `closeManualEdit()` 신설.
  - `loadRunStats()`: 정상 next 계정 케이스에서 `manualEditMode` 분기 — 닫힘=`[수동발송처리]` 1개, 편집중=`[−1] [+1] [수정완료]`. 각 ±1 클릭은 기존 `adjustNextAccount(delta)`로 **즉시 DB 반영**(즉시반영 모델, 별도 commit 없음).
  - 안전장치: 폴링 중 `currentNextAccountId`가 바뀌면 `manualEditMode=false`로 자동 종료 — 다른 계정에 의도치 않게 ±하지 않도록. empty/계정0개 케이스에서도 자동 종료.
- 서버/repo/RPC 변경 없음.


## 다음 사용 계정 옆에 주간 카운트 강제 증감 버튼 (26.04.29)
수동 발송 보정용. "다음 사용 계정" 표시 우측에 `−1` / `+1` 버튼. 표시된 계정의 이번 주 카운트 즉시 변경 후 화면 갱신.
- [scripts/schema.sql](scripts/schema.sql): `adjust_weekly_count(p_account_id, p_week_key, p_delta)` RPC 추가. UPSERT + `greatest(count+delta, 0)`로 0 미만 클램프. **운영 DB는 SQL Editor에서 이 함수 1회 실행 필요**(schema.sql의 `create or replace function adjust_weekly_count ...` 블록).
- [src/repo/accountsRepo.js](src/repo/accountsRepo.js): `adjustJson` / `adjustSupabase` + 공용 `adjustSendCount(accountId, weekKey, delta)` 추가. JSON 모드는 `Math.max(0, c+delta)` 후 jsonSave. exports에 추가.
- [src/accountManager.js](src/accountManager.js): `adjustSendCount(accountId, delta)` 노출 (현재 weekKey 자동).
- [server.js](server.js): `POST /api/accounts/:id/adjust-week` 엔드포인트. body `{delta:±1}`만 허용, 그 외 400.
- [public/index.html](public/index.html):
  - `.next-account-row`를 flex(`space-between`)로 변경, `.info` / `.adjust-group` 분리.
  - `.adjust-btn` 스타일 추가 (32×28, 보라톤).
  - `loadRunStats()`: 정상 케이스에 `−1` / `+1` 버튼 렌더, `next.sent <= 0`이면 `−1` disabled. empty 케이스는 버튼 미렌더.
  - 모듈 레벨 `currentNextAccountId` + `adjustNextAccount(delta)` 추가 — fetch 성공 후 `loadRunStats()` 재호출로 갱신.
- 기존 매크로 발송의 `incrementSendCount` 흐름은 변경 없음.

## 실행 > 발송 현황에 "다음 사용 계정" 표시 (26.04.29)
인포크링크 발송 시 다음 순서로 사용될 계정을 '실행 > 발송 현황'에서 stat-card 묶음 아래에 명시.
- "다음 사용 계정" 정의: [src/accountManager.js](src/accountManager.js) `getAvailableAccount()`와 동일 — `accountsRepo.list()` (`id` ASC) 중 `remaining > 0`인 첫 계정. 클라에서는 `/api/accounts` 응답에 `accs.find(a => a.remaining > 0)`로 산출.
- [public/index.html](public/index.html):
  - 카드 본문에 `<div id="nextAccountRow">` 추가 (run-stats 그리드 외부, 같은 카드 내).
  - CSS `.next-account-row` 추가 — 보라톤 보조 박스. 소진/계정0개 케이스는 `.empty` 변형(주황톤).
  - `loadRunStats()`: 4개 stat-card 렌더 후 next 계산 → 정상/소진/계정0개 3분기로 innerHTML 채움. 표시 형식: `다음 사용 계정 (인포크): <username> · 이번 주 N/10 발송 · 남은 슬롯 M개`.
  - username은 기존 `esc()` 헬퍼로 escape.
- API 추가 없음 — 기존 `/api/accounts`가 username/sent/remaining 전부 반환.
- 폴링 흐름에 자연 편입 — 매 주기 `loadRunStats()` 호출 시 같이 갱신.


## 설정 > 계정 추가 저장 안 됨 (26.04.29)
Supabase 모드에서 "+ 계정 추가" 후 저장 눌러도 DB에 들어가지 않던 버그 수정.
- 원인: [public/index.html](public/index.html) `addAccount()`가 클라이언트에서 `Math.max(...ids)+1`로 임의 id 부여 → [src/repo/accountsRepo.js](src/repo/accountsRepo.js) `replaceAllSupabase`의 `id != null`은 update / `== null`은 insert 분기에서 신규 계정이 update로 떨어지고, 존재하지 않는 id에 대한 `update().eq('id', …)`는 에러 없는 nop이라 silent fail.
- [public/index.html](public/index.html) `addAccount()`: 신규 row를 `id: null`로 push → server에서 insert 분기 진입. 저장 후 `loadAccounts()`로 DB가 부여한 실제 id 수신.
- [public/index.html](public/index.html) `renderAccounts()` id 셀: `${acc.id ?? '신규'}` — 저장 전 row는 "신규"로 표시.
- [src/repo/accountsRepo.js](src/repo/accountsRepo.js) `replaceAllJson`: id 결손 row에 `Math.max(existing)+1`로 자동 id 부여 (Supabase는 SERIAL이라 무관, JSON 모드 호환용).

## 제품 검색 기능 (26.04.28)
[public/index.html](public/index.html):
- 제품 목록 actions-bar에 검색 input(`type=search`) 추가 — 관리명/브랜드명/제품명/카테고리/캠페인유형 대상, 대소문자 무시 substring 매칭.
- `productSearchQuery` 전역 + `productMatchesSearch(p)` 헬퍼 + `onProductSearchChange()` 라이브 핸들러.
- `renderProducts()`: 매칭 인덱스만 카드 렌더, 인덱스(`i`)는 원래 배열 인덱스 유지 → onchange·사진 업로드·삭제 핸들러 정합성 보존.
- `productCount`: 검색 중엔 `매칭/전체`(예: `3/12`), 평소엔 전체.
- 매칭 0건 + 제품 있을 때 "검색 결과 없음" 안내.
- `addProduct()` 호출 시 검색어 자동 비움 — 새 제품이 필터에 가려지지 않도록.

## 사진 orphan 정리 + 미저장 표시 (26.04.28)
### 1. orphan 정리 스크립트
- [scripts/cleanupOrphanPhotos.js](scripts/cleanupOrphanPhotos.js) 신규.
  - Storage `product-photos` 전체 list(paginated) ↔ DB `product_photos.url` 비교 → 미참조 = orphan.
  - 기본 **dry-run** (출력만), `--force`로 실제 삭제. 삭제 전 5초 카운트다운.
  - **30분 grace period** 기본 (방금 업로드한 파일 보호). `--grace <분>` 으로 조정.
  - DB 조회 실패 시 즉시 abort(전부 삭제 방지).
  - `USE_SUPABASE=false` 모드에선 즉시 종료(해당 없음).
- [package.json](package.json) 에 `npm run cleanup-orphans` 스크립트 추가.
- signatures 버킷은 이번 작업 미포함 — 동일 구조이므로 후속 요청 시 같은 방식으로 추가 가능.

### 2. 미저장 변경사항 표시
- [public/index.html](public/index.html):
  - CSS: `.dirty-indicator { display:none ... color:#f59e0b }`, `body.products-dirty .dirty-indicator { display:inline }`.
  - 헬퍼: `markProductsDirty()` / `clearProductsDirty()` (body class 토글).
  - 카드 액션 영역 저장 버튼 좌측에 `<span class="dirty-indicator">● 미저장</span>` 추가.
  - 변경 감지: `productsList` 컨테이너에 `input`/`change` 이벤트 위임 — 모든 input/textarea/select 입력 자동 마킹.
  - 프로그래매틱 변경(`addProduct`/`removeProduct`/`addHookingPhrase`/`removeHookingPhrase`/`applyHookingModal`/`uploadPhotos`/`removePhoto`)에서 `markProductsDirty()` 명시 호출.
  - `loadProducts()` 완료 후, `saveProducts()` 성공(2xx) 후 `clearProductsDirty()`. 검증 실패/네트워크 실패 시엔 dirty 유지.
- 색상: 주황 `#f59e0b` — 알아챌 수는 있되 거슬리지 않게.

## 제품 — 저장 버튼 명시 저장만 (26.04.28)
사진 업로드·제품 삭제 시에도 명시적으로 "저장" 버튼을 눌러야 DB 반영되도록 통일.
- [public/index.html](public/index.html):
  - `uploadPhotos()`: 마지막의 자동 `saveProducts()` 호출 제거. 메모리·UI에는 즉시 반영, DB 반영은 저장 버튼.
  - `removeProduct()`: 마지막의 자동 `saveProducts()` 호출 제거. 동일하게 저장 버튼으로만 반영.
- 텍스트 필드(브랜드명/USP/후킹문구 등)는 원래부터 onchange 시 메모리만 갱신 → 동작 일관.
- 주의: 업로드한 사진은 이미 서버 Storage엔 올라간 상태. 저장 버튼 안 누르고 새로고침하면 products 행에는 photo URL이 안 묶이지만 Storage 파일은 남아있음(orphan). 추후 정리 필요 시 별도 작업.

## 제품 카드 정리 + 예시 주인 계정 + 필수 표시 (26.04.28)
1. **빈 여백 손 커서 제거** — [public/index.html](public/index.html) `.product-card` 외곽 div의 `style="cursor:pointer"`를 `.product-header`로 이동. 클릭 영역(헤더)만 손 모양, 펼친 카드 본문은 기본 커서.
2. **"예시 주인 계정" 컬럼 추가** (선택·내부용 텍스트 필드)
   - [scripts/schema.sql](scripts/schema.sql) products 테이블 + 하단 ALTER 블록에 `announce_example_owner text` 추가.
   - ⚠️ 운영 DB용 1줄: `alter table products add column if not exists announce_example_owner text;`
   - [src/repo/productsRepo.js](src/repo/productsRepo.js) `listSupabase` / `replaceAllSupabase` 매핑 확장.
   - [scripts/migrateJsonToSupabase.js](scripts/migrateJsonToSupabase.js) `migrateProducts` 매핑 확장.
   - [public/index.html](public/index.html) "공고 예시 링크" 아래에 "예시 주인 계정" form-group 추가 + `addProduct` 초기화에 `announceExampleOwner: ''` 추가.
3. **필수 항목 빨간 `*`** — [public/index.html](public/index.html) `renderProducts()` 의 7개 필수 라벨(관리명/브랜드명/제품명/카테고리/캠페인유형/USP/제안메일내용) 앞에 `<span style="color:#ef4444;margin-right:2px">*</span>` prefix. 메일 제목은 선택이라 미표시.

## 후킹문구 아코디언 (26.04.28)
후킹문구 입력 리스트를 접었다 폈다 가능하도록.
- [public/index.html](public/index.html):
  - 전역 `Set hookingOpenIdx` + `toggleHookingOpen(i)` 추가.
  - `renderProducts()` 후킹문구 헤더 좌측에 chevron(`▶`, 펼침 시 90° 회전)과 라벨을 묶어 클릭 영역으로. 카운트 `(N개)`는 항상 표시.
  - 입력 리스트 div는 `display:${hookingOpenIdx.has(i)?'block':'none'}` 으로 조건부 노출.
  - `addHookingPhrase`/`applyHookingModal`에서 해당 인덱스를 `hookingOpenIdx`에 add → 추가/일괄 입력 직후 자동 펼침.
  - 기본 상태: 접힘.

## hr 정렬 + 후킹문구 버튼 위치 (26.04.28)
[public/index.html](public/index.html) `renderProducts()` 미세 정리.
- 구분선 hr: `width:50%;margin:20px auto 0` — 가운데 정렬, 절반 길이.
- 후킹문구 섹션: 상단에 flex row(`justify-content:space-between`) 추가해 좌측 라벨 / 우측 "+ 후킹문구 추가"·"📋 일괄 입력" 두 버튼 배치. 입력 row 리스트는 그 아래로.

## 제품 카드 — 발송용 / 내부용 시각적 구분선 (26.04.28)
[public/index.html](public/index.html) `renderProducts()` 의 추가 필드 그리드 마커 위에 연한 `<hr>` 삽입.
- 스타일: `border:none;border-top:1px solid #e5e7eb;margin:20px 0 0` — 기존 product-card 테두리·photo-thumb과 동일한 `#e5e7eb` 사용해 톤 통일. 텍스트 없이 시각적 구분만.

## 후킹문구 일괄 붙여넣기 (26.04.28)
줄바꿈으로 구분된 텍스트를 모달에 붙여넣어 후킹문구 여러 개를 한 번에 등록.
- [public/index.html](public/index.html):
  - 후킹문구 섹션 버튼 영역에 **"📋 일괄 입력"** 추가 (기존 "+ 후킹문구 추가"와 나란히, 둘 다 `btn-outline btn-sm`로 통일).
  - `</body>` 직전에 모달 오버레이 div(`#hookingModal`) 추가 — textarea(rows=14), "기존 항목 뒤에 추가"/"교체" 라디오, "적용"/"취소"/"✕" 버튼. 배경 클릭 시 닫힘.
  - JS 함수 `openHookingModal(i)` / `closeHookingModal()` / `applyHookingModal()` + 전역 `currentHookingTarget` 추가.
  - "적용" 동작: textarea를 `\n` 기준 split → trim → 빈 줄 제거 → 모드에 따라 append 또는 replace. 빈 입력은 alert로 차단.

## 제품 목록 필드 확장 (26.04.28)
제품관리 > 제품 목록에 7개 신규 필드 추가 + 기존 필드 필수 검증.
- **신규 필드(모두 선택, 내부용)**: 후킹문구(`text[]` +/− 가변), 제품링크, 공고예시링크, 허들, 일정, 메모, 연령대
- **필수 검증**: 메일제목 제외 기존 필드 전부 (관리명/캠페인유형/브랜드명/제품명/카테고리/USP/제안메일내용). `saveProducts()`가 빈 값 시 alert + 해당 카드 펼치고 중단.
- [scripts/schema.sql](scripts/schema.sql) products 테이블에 7컬럼 추가 + 기존 DB용 멱등 ALTER 블록 추가.
  - ⚠️ 기존 Supabase DB는 SQL Editor에서 `ALTER TABLE products ADD COLUMN IF NOT EXISTS ...` 7줄을 1회 실행해야 함.
- [src/repo/productsRepo.js](src/repo/productsRepo.js): `listSupabase` SELECT·매핑, `replaceAllSupabase` insert 매핑 확장. JSON 모드는 자연 통과.
- [scripts/migrateJsonToSupabase.js](scripts/migrateJsonToSupabase.js) `migrateProducts`: 재실행 시 일관성 위해 7필드 매핑 추가.
- [public/index.html](public/index.html):
  - `renderProducts()`: 기존 2열 그리드 뒤에 새 그리드(제품링크/공고예시링크/허들/일정/연령대), 후킹문구 동적 리스트(+/− 버튼), 메모 textarea 추가.
  - `addProduct()`: 신규 객체에 7필드 초기화.
  - `addHookingPhrase`/`removeHookingPhrase` 헬퍼 추가.
  - `saveProducts()`: 필수 검증 추가.
- 메일/제안서 코드(`emailSender.js`/`proposal.js`)는 변경 없음 — 신규 필드는 UI/DB 저장 전용.

## 다중 PC 접속 시 매크로 실행 상태 동기화 (26.04.27)
한쪽 PC에서 매크로 실행 중일 때 다른 PC에서 접속해도 UI가 동일하게 보이도록 수정.
- [public/index.html](public/index.html) `syncMacroRunning()` 함수 추가 — `/api/macro/status` GET → `running===true`이면 `btnStart`/`btnDryRun` 숨김, `btnStop` 노출, `headerStatus` "발송 중", `pollTimer = setInterval(pollStatus, 1000)` + 즉시 `pollStatus()` 1회 호출.
- 초기 로드 섹션에서 `syncMacroRunning()` 호출 추가.
- 서버 코드 변경 없음 — `macroProcess`는 이미 단일 source of truth였고, 클라이언트가 그 상태를 안 가져오던 것이 원인.
## 확인필요 카드 — in-flight sending row 오표시 수정 (26.04.27)
매크로 실행 중 정상 처리 중인 row(`pending → sending → 성공 시 삭제`)가 카드에 잠깐 떴다 사라지면서 "발송 중 중단된 건"으로 잘못 안내되던 문제 수정.
- [src/repo/influencersRepo.js](src/repo/influencersRepo.js) `listSendingSupabase(staleSeconds)`: `staleSeconds > 0`이면 `.lt('updated_at', now-staleSeconds)` 적용해 그 시점 이전 row만 반환. 공용 `listSending`도 인자 통과.
- [server.js](server.js) `GET /api/influencers/sending`: `macroProcess` 활성 시 `staleSeconds=120`, 미활성 시 `0` 전달.
- JSON 모드 `listSendingJson`은 기존대로 no-op.
- 결과: 매크로 실행 중에는 sending에 2분 이상 머문 row(=진짜 stuck)만 카드 노출. 매크로 미실행 상태에선 모든 sending row 즉시 노출.
## 발송 중 크래시 대비 — `sending` 중간 상태 도입
send 성공 후 DB write 사이에 크래시가 나면 해당 1건이 중복 발송 후보로 남는 문제. 2단계 상태 전이로 수동 확인 가능하게 함.
- **스키마**: [scripts/schema.sql](scripts/schema.sql) influencers.status CHECK에 `'sending'` 추가 + 기존 테이블용 ALTER 마이그레이션 블록 포함.
  - ⚠️ 기존 Supabase DB는 **SQL Editor에서 `ALTER TABLE influencers ...` 블록을 한 번 실행해야** 'sending' 상태가 허용됨(schema.sql 하단 참고).
- **influencersRepo**: `markSending`, `listSending`, `resolveSendingAsSent`(→ sent_log insert + row 삭제), `resolveSendingAsPending` 추가. Supabase 전용(JSON 모드는 no-op).
- **src/index.js**: 이메일/인포크 send 직전 `markSending` 삽입. 이메일은 DRY_RUN `continue` 이후라 자연 제외, 인포크는 `!DRY_RUN` 가드.
- **server.js**: `GET /api/influencers/sending`, `POST /api/influencers/:id/resolve` (body `{action:'sent'|'requeue'}`)
- **public/index.html**: "⚠️ 확인 필요" 카드 + `loadSending()` (초기 로드·pollStatus 양쪽 호출). 행별 `[실제로 보냄]`/`[pending 복구]` 버튼.
- **알려진 한계**:
  - sent_log에 account_id=null로 기록됨(sending 상태엔 계정 정보 미보존)
  - 인포크 경로에서 incrementSendCount 이전 크래시 시 주간 카운터 1건 누락(최대 11건/주 가능)
  - DRY_RUN에서는 markSending 미호출

## sent.log 관련 설정 및 로그 전부 제거
파일 기반 `logs/sent.log`(JSON 롤백 모드 전용 레거시)를 완전히 제거. Supabase `sent_log` 테이블과 `/api/logs`("누적 발송" 카운트)는 유지.
- [logs/sent.log](logs/sent.log) 파일 삭제
- [config.js](config.js): `PATHS.sentLog` 엔트리 제거
- [src/repo/sentLogRepo.js](src/repo/sentLogRepo.js): JSON 분기(`ensureLogDir`/`appendJson`/`listJson`) 전부 제거, `fs`/`path` import 삭제 → `append`·`list` 항상 Supabase 경로
- [scripts/migrateJsonToSupabase.js](scripts/migrateJsonToSupabase.js): `migrateSentLog()` 함수 및 호출 제거 (이관 완료된 상태)
- [scripts/testSentLogRepo.js](scripts/testSentLogRepo.js) 파일 삭제
- [CLAUDE.md](CLAUDE.md): `logs/sent.log` 설명 라인 삭제
- [scripts/schema.sql](scripts/schema.sql): `-- logs/sent.log 대체` 주석 정리
- [.claude/settings.local.json](.claude/settings.local.json): `testSentLogRepo` permission 엔트리 제거
- 부수 효과: JSON 롤백 모드(`USE_SUPABASE=false`)에서도 감사 로그만은 Supabase `sent_log` 테이블로 직접 write. 롤백이 긴급용인 점을 감안해 허용.

## 발송한 인플루언서 건바이건 삭제
실행 시(실제 발송, DRY-RUN 아님) 발송에 성공한 인플루언서는 건이 끝나는 즉시 대기 목록과 DB에서 모두 제거되어야 한다. 현재는 status='sent'만 찍히고 JSON 모드에선 아예 남아있으며, UI의 대기 목록은 run 끝나야 갱신됨. 감사 이력은 `sent_log` 테이블에 별도 존재하므로 `influencers` row는 삭제해도 안전.

## 메일만 발송하는 실행 옵션 추가
매크로 실행 시 "메일만 발송" 선택지 추가. 켜면 인포크 브라우저 경로는 아예 스킵하고 이메일 타겟만 처리.

## 외부 접속 가능하도록 배포
1. **비밀번호 인증** — `express-session` 도입. `settings.json.adminPassword`가 비어있으면 auth 비활성, 값이 있으면 `/login` 통과 전까지 모든 경로 차단. 세션 쿠키 7일 만료, 시크릿은 프로세스 시작 시 랜덤. [public/login.html](public/login.html) 추가. `POST /api/login`, `POST /api/logout`, `GET /api/auth/status` 엔드포인트. 설정 UI에서 비밀번호 변경 가능.
2. **Headless 토글** — [config.js](config.js)의 `HEADLESS`를 `settings.json.headless` 읽는 getter로 변환. 설정 UI에서 체크박스로 토글.
3. **PORT env** — `PORT=8080 npm run ui` 형태로 포트 오버라이드 가능 (기본 3000).
4. `npm run tunnel`로 cloudflared 터널 실행. ngrok 고정 도메인 사용 경로는 [md/how-to-run.md](md/how-to-run.md)에 유지.
5. 인증 흐름 smoke test 통과: 비번 없음→전부 통과 / 비번 설정→`/`는 302, `/api/*`는 401, `/login` 200 / 잘못된 비번 401 / 올바른 비번 후 쿠키로 API 접근 200.

## Supabase 메인 DB 이전
JSON 파일로 관리 중이던 모든 운영 데이터(`accounts`, `emailAccounts`, `products`, `influencers`, `replies`, `failed`, `sent.log`)를 Supabase(Postgres + Storage)로 이관 완료.
- 9개 테이블 + `product-photos`·`signatures` public 버킷
- 주간 카운터는 별도 `weekly_tracking` 테이블 + `increment_weekly_count` RPC로 원자적 증가 (병렬 10건 호출 테스트 통과)
- `src/repo/` 7개 repo (accounts/products/influencers/emailAccounts/sentLog/replies) — `USE_SUPABASE` 플래그로 JSON·Supabase 분기, 현재 기본값 `true`
- 호출부: `accountManager`, `index`, `emailSender`, `checkReplies`, `logger`, `resetCounts`, `server`의 관련 엔드포인트 전부 repo 경유
- 제안서 이미지 업로드(`setInputFiles`)는 URL→로컬 경로 해석기 추가 — `assets/` 캐시 히트 우선, 없으면 `%TEMP%`에 다운로드
- `settings.json`은 JSON 유지 (MAIL_BCC getter sync 접근 제약)
- 긴급 롤백: `USE_SUPABASE=false npm run ui`
- 추후 정리 여지: `assets/` 폴더 역할 정돈, 1~2주 검증 후 JSON 분기 코드 제거


## 답장확인 - 로그인 실패시
로그인 실패하면 캐시비우기 새로고침 다시 하고 다음 작업 재수행하도록 기능추가

## 답장확인 - 원하는 계정부터 선택해서 순차
accounts.json 계정목록을 selectbox 로 선택해서 해당계정부터 순차적으로 답장확인 프로세스 시작할수 있는 기능 추가

## 답장확인
답장확인 버튼 누르면  매크로 크롬창 별도로 띄우지 않도록. 
실행 로그와 실행결과 화면만 뜨면 됨. 
실행완료되면 결화뜨는게 아니라, 계정 하나 끝나면 결과에 실시간으로 반영하도록

## proposal.js
"x" 입력된 URL은 건너뜀 : 기능 직접 추가했음. 코드 전체 검토만 하고 수정할 필요 없음

## 각 계정별 로그인하면서 연락온거 있나 확인하는 기능 추가

## 로그인/로그아웃 공통 프로세스
캐시비우기새로고침 어떤 작업/함수에서든 공통적으로 수행해야하는 작업
로그인->캐시비우기새로고침
로그아웃->캐시비우기새로고침

