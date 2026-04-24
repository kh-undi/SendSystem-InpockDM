# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

인포크링크(`business.inpock.co.kr`) 제안서를 Playwright로 자동 발송하는 매크로 + Gmail 이메일 발송 매크로 + 답장 확인 매크로. Express 관리 UI(`server.js`)가 모든 기능을 감싼다.

## 자주 쓰는 명령어

```bash
npm run ui            # 관리 UI 기동 (http://localhost:3000)
npm start             # CLI로 매크로 실행 (UI 거치지 않고 바로)
npm run dry-run       # 실제 제출 없이 전 과정만 수행 (검증용)
npm run reset-counts  # 전 계정의 weeklyTracking 초기화
npm run check-replies # 답장 확인 매크로 CLI 실행
npm run tunnel        # cloudflared로 외부 임시 URL 발급 (ngrok은 md/how-to-run.md)
```

- `PORT=8080 npm run ui` — 포트 오버라이드
- `USE_SUPABASE=false npm run ui` — JSON 롤백 모드

UI에서 "발송 시작"을 누르면 [server.js](server.js)가 `node src/index.js` 자식 프로세스를 spawn하고, 필요 시 `EMAIL_ACCOUNT_ID` 환경변수를 주입한다. UI가 보여주는 실시간 로그는 자식 프로세스의 stdout/stderr 버퍼(`macroLogs`, `replyLogs`)다.

테스트/린트 스크립트는 없다.

### 외부 접속 & 인증

- [server.js](server.js)는 express-session 기반 비밀번호 인증을 적용. `settings.json`의 `adminPassword`가 비어있으면 **인증 비활성**(로컬 운영), 값이 있으면 `/login` 통과 전까지 모든 API/페이지 차단.
- 로그인 페이지: [public/login.html](public/login.html). 엔드포인트: `POST /api/login`, `POST /api/logout`, `GET /api/auth/status`.
- 세션 시크릿은 프로세스 시작 시 랜덤 생성 → 서버 재시작 시 전원 재로그인(의도된 동작).
- 외부 노출 방법은 [md/how-to-run.md](md/how-to-run.md) 참고 — ngrok 고정 도메인(`shimmy-defame-unifier.ngrok-free.dev`)과 cloudflared 임시 URL 둘 다 사용 가능.
- `config.HEADLESS`는 `settings.json`의 `headless` 값에서 읽히는 getter. 외부 접속 시 체크하면 발송 트리거 시 로컬 PC에 크롬창이 뜨지 않음.

## 아키텍처 전체 흐름

[src/index.js](src/index.js)가 오케스트레이터다. 한 번 실행되면:

1. [src/repo/influencersRepo.js](src/repo/influencersRepo.js)의 `listPending()`이 발송 대상(status=pending) 로드.
2. `profileUrl`에 `@`가 있으면 **이메일 경로**, 아니면 **인포크 브라우저 경로**로 분기.
3. 이메일 타겟은 [src/emailSender.js](src/emailSender.js)의 `sendMail()`로 nodemailer(Gmail SMTP) 발송. `EMAIL_ACCOUNT_ID` env로 [src/repo/emailAccountsRepo.js](src/repo/emailAccountsRepo.js)에서 계정 선택.
4. 인포크 타겟은 Playwright chromium을 띄워 [src/accountManager.js](src/accountManager.js)의 `getAvailableAccount()`가 고른 계정(from [src/repo/accountsRepo.js](src/repo/accountsRepo.js))으로 [src/auth.js](src/auth.js)의 `login()` → [src/proposal.js](src/proposal.js)의 `sendProposal()` → 슬롯 소진되면 `logout()` → 다음 계정으로 순환.
5. 실패는 `influencers.status='failed'` + `error` 컬럼으로 즉시 기록. UI의 "재발송"은 failed→pending 상태 전환.

### Repo 레이어 / DB 모드

모든 데이터 I/O는 [src/repo/](src/repo/) 아래 7개 repo를 경유한다 (`accountsRepo`, `productsRepo`, `influencersRepo`, `emailAccountsRepo`, `sentLogRepo`, `repliesRepo`).

- **기본 모드: Supabase** — Postgres + Storage. 설정은 [.env](.env)의 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **롤백 모드: JSON** — `USE_SUPABASE=false` 환경변수로 기존 JSON 파일 I/O 복귀. 각 repo가 `config.USE_SUPABASE` 플래그로 내부 분기.
- Supabase 클라이언트 싱글톤: [src/db.js](src/db.js).
- 설정값(`settings.json`)만은 DB로 옮기지 않고 로컬 파일 유지 — `config.MAIL_BCC` getter가 동기 접근해서.

### 핵심 도메인 규칙

- **주간 10건 제한**: [config.js](config.js)의 `WEEKLY_LIMIT = 10`. ISO 주차 키(예: `2026-W16`)로 `weekly_tracking` 테이블에 누적.
  - Supabase 모드: `increment_weekly_count(account_id, week_key)` RPC로 **원자적 UPSERT**. 병렬 발송·크래시 시에도 카운터 유실·중복 없음.
  - JSON 모드: `accounts.json[].weeklyTracking` 즉시 파일 write.
- **이메일 vs 인포크 라우팅**: `EMAIL_REGEX` 매칭으로 자동 분기. `profileUrl`이 `x`면 스킵, `@` 포함이면 이메일, 그 외는 인포크 URL(`http://` 자동 보정).
- **DOM 셀렉터 중앙화**: 모든 인포크 사이트 셀렉터는 [src/selectors.js](src/selectors.js)에 있다. UI 변경으로 깨지면 여기만 고친다.
- **BCC 하드코딩**: [config.js](config.js)의 `MAIL_BCC`가 모든 Gmail 발송에 강제 BCC로 붙는다. 값은 `settings.json`.

### 답장 확인 파이프라인

[src/checkReplies.js](src/checkReplies.js)는 각 계정으로 headless 로그인 → `sendbird-badge` 엘리먼트 개수로 답장 수 집계 → [src/repo/repliesRepo.js](src/repo/repliesRepo.js)가 계정 하나 끝날 때마다 실시간 기록.

- Supabase 모드: `reply_runs` 1 row + `replies` N rows. `reply_runs.finished_at IS NULL`이면 "진행 중(partial)".
- JSON 모드: `replies.json` 단일 파일, `partial: true/false` flag.
- UI는 어느 모드든 공통으로 repo를 통해 조회.

[server.js](server.js)의 node-cron이 매일 08:30/10:30/12:30/14:30에 자동 실행한다. `--start <username>` 인자로 특정 계정부터 순차 시작 가능.

### 이미지 저장/참조

- Supabase 모드: `product-photos`, `signatures` 버킷 (public). DB에는 public URL이 저장됨.
- 이메일 발송: nodemailer는 URL·로컬 경로 모두 `path:`에 직접 넘길 수 있어 별도 다운로드 불필요.
- 인포크 제안서(Playwright `setInputFiles`)는 로컬 경로만 받음 → [src/proposal.js](src/proposal.js)의 `resolvePhotosToLocal()`이 ① `assets/<basename>` 존재 시 즉시 사용, ② 없으면 `%TEMP%/inpock-photos/`에 1회 다운로드 후 사용.
- 신규 업로드(UI): multer가 먼저 `assets/`에 저장 → [src/repo/productsRepo.js](src/repo/productsRepo.js)의 `uploadPhoto()`가 Storage로 올리고 public URL 반환.

### 로그인/로그아웃 공통 규약

[md/request.md](md/request.md)의 결정사항: 로그인·로그아웃 모두 반드시 캐시 비우기 + 새로고침을 수행한다. [src/auth.js](src/auth.js)가 이미 구현하고 있으니 인증 관련 코드를 만질 때는 이 규약을 깨지 말 것. 로그인 실패 시 새로고침 후 1회 재시도하는 것도 의도된 동작이다.

## 작업 진행 프로토콜 — [md/request.md](md/request.md)

이 저장소는 [md/request.md](md/request.md)에 요청사항을 적는 방식으로 협업한다. 규칙(파일 상단에 명시됨):

1. 요청 제목은 `## ` 으로 시작.
2. `[ 요청사항 ]` 밑에 새 요청이 들어오면 Claude는 먼저 `[ 실행계획 ]`에 계획을 추가만 한다 — **사용자가 "작업시작"이라고 하기 전에는 코드 수정 금지**.
3. 작업 시작하면 변경 코드에 해당 작업 내용 주석을 남긴다(예: `// [요청] ...`). `src/checkReplies.js`의 기존 주석이 이 패턴의 예시.
4. 작업 완료되면 `[ 요청사항 ]`의 해당 항목을 `[ 작업완료 ]` 상단으로 옮기고, 사용한 실행계획은 지운다.

이 프로토콜은 일반적인 CLAUDE.md 규범보다 우선한다. 특히 "작은 버그 수정이라도 승인 없이 건드리지 말 것"을 의미한다.

## 데이터 소스

### Supabase (기본)

[scripts/schema.sql](scripts/schema.sql)이 전체 DDL. 9개 테이블:
- `accounts` + `weekly_tracking` (발송 계정 / 주간 카운터)
- `email_accounts` (Gmail 계정·서명)
- `products` + `product_photos` (제품·사진 URL)
- `influencers` (발송 큐 + 실패 기록 통합, `status=pending|sent|failed|skipped`)
- `sent_log` (append-only 감사 로그)
- `reply_runs` + `replies` (답장 확인)
- Storage 버킷: `product-photos`, `signatures` (모두 public)
- RPC: `increment_weekly_count(account_id, week_key)` — 원자적 카운터 증가

### JSON 파일 (롤백용으로 유지)

`USE_SUPABASE=false`일 때만 사용. 스키마는 DB와 동일한 의미:
- `accounts.json`: `{id, username, password, weeklyTracking: {"YYYY-Www": n}}`
- `emailAccounts.json`: `{id, email, appPassword, senderName, signature, signatureImage}`
- `products.json`: `{products: [{name, brandName, productName, campaignType, category, usp, offerMessage, photos[], mailSubject?}]}`
- `influencers.json` / `failed.json`: `{nickname, profileUrl, productName, [error]}`
- `replies.json`: `{checkedAt, partial, results[]}`

### 설정 파일 (양쪽 모드 공통)

- `settings.json`: `mailBcc` 등. DB로 옮기지 않음 — [config.js](config.js) getter가 sync 접근해야 해서.
- [.env](.env): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (gitignored).

## 마이그레이션·검증 스크립트 ([scripts/](scripts/))

- `schema.sql` — Supabase SQL Editor에 붙여넣는 DDL (멱등)
- `uploadAssets.js` — 로컬 `assets/` → Storage 업로드
- `migrateJsonToSupabase.js --force` — JSON 전량을 DB로 이관 (테이블 비우고 재삽입)
- `verifyMigration.js` — 이관 후 카운트·관계 검증
- `testAccountsRepo.js` / `testProductsRepo.js` / ... — 각 repo의 JSON·Supabase 결과 비교
- `testIncrementRpc.js` — 원자적 카운터 병렬 10건 동시 호출 테스트

## 주의사항

- `config.HEADLESS = false`가 기본 — 브라우저 창이 뜨는 건 의도다. 답장 확인만 `checkReplies.js` 내부에서 `headless: true`로 강제한다.
- `products.json`(또는 DB)에 없는 `productName`을 가진 인플루언서가 있으면 [src/index.js](src/index.js)가 `process.exit(1)` — 제품명 매칭은 엄격하다.
- **이미지 경로 혼재**: 현재 `assets/` 폴더는 (1) 마이그레이션 전 레거시 이미지, (2) UI 신규 업로드 임시저장, (3) 제안서용 로컬 캐시 3역할을 겸한다. 향후 정리 여지.
- **Supabase 무료 프로젝트**: 7일 미접속 시 자동 pause. 이 프로젝트는 cron + 수동 접속으로 실질적으로 pause되지 않음.
- **롤백 절차**: 문제 발생 시 `USE_SUPABASE=false npm run ui`로 JSON 모드 즉시 복귀. 이 상태에서 JSON 파일을 수정했다면, Supabase로 복귀 전에 `node scripts/migrateJsonToSupabase.js --force` 재실행 필요.
