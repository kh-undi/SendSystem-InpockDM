1. 요청사항 제목시작을 '## ' 으로 시작함.
2. 요청사항을 읽고 '실행계획' 영역에 작업할 내용을 추가함. 그 전까지 클로드코드는 작업시작 명령 없이 코드수정을 하지 않음
3. 작업시작하면 코드에 작업내용 주석추가
4. 요청사항 작업이 끝나면 '요청사항' 내용을 '작업완료' 상단으로 이동시킨다. 수정내용 제목 맨 뒤에 날짜(yy.mm.dd) 기재
5. 수행한 실행계획 내용은 지운다. 

[ 요청사항 ]


[ 실행계획 ]


[ 작업완료 ]
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

