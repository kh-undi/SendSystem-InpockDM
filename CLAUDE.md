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
```

UI에서 "발송 시작"을 누르면 [server.js](server.js)가 `node src/index.js` 자식 프로세스를 spawn하고, 필요 시 `EMAIL_ACCOUNT_ID` 환경변수를 주입한다. UI가 보여주는 실시간 로그는 자식 프로세스의 stdout/stderr 버퍼(`macroLogs`, `replyLogs`)다.

테스트/린트 스크립트는 없다.

## 아키텍처 전체 흐름

[src/index.js](src/index.js)가 오케스트레이터다. 한 번 실행되면:

1. [src/influencerReader.js](src/influencerReader.js)의 `readInfluencersAuto()`가 `influencers.json` 우선, 없으면 `influencers.csv`를 읽는다.
2. `profileUrl`에 `@`가 있으면 **이메일 경로**, 아니면 **인포크 브라우저 경로**로 분기.
3. 이메일 타겟은 [src/emailSender.js](src/emailSender.js)의 `sendMail()`로 nodemailer(Gmail SMTP) 발송. `EMAIL_ACCOUNT_ID` env로 `emailAccounts.json`에서 계정 선택.
4. 인포크 타겟은 Playwright chromium을 띄워 [src/accountManager.js](src/accountManager.js)의 `getAvailableAccount()`가 고른 `accounts.json` 계정으로 [src/auth.js](src/auth.js)의 `login()` → [src/proposal.js](src/proposal.js)의 `sendProposal()` → 슬롯 소진되면 `logout()` → 다음 계정으로 순환.
5. 실패 건은 `failed.json`에 저장. UI의 "재발송"은 이 목록을 `influencers.json`에 병합하고 `failed.json`을 삭제.

### 핵심 도메인 규칙

- **주간 10건 제한**: [config.js](config.js)의 `WEEKLY_LIMIT = 10`. [src/accountManager.js](src/accountManager.js)가 ISO 주차 키(예: `2026-W16`)로 `accounts.json[].weeklyTracking`에 누적 카운트한다. 성공 시 `incrementSendCount()`가 즉시 파일에 persist — 크래시해도 카운트는 유지된다.
- **이메일 vs 인포크 라우팅**: `EMAIL_REGEX` 매칭으로 자동 분기. `profileUrl`이 `x`면 스킵, `@` 포함이면 이메일, 그 외는 인포크 URL(`http://` 자동 보정).
- **DOM 셀렉터 중앙화**: 모든 인포크 사이트 셀렉터는 [src/selectors.js](src/selectors.js)에 있다. UI 변경으로 깨지면 여기만 고친다.
- **BCC 하드코딩**: [config.js](config.js)의 `MAIL_BCC`가 모든 Gmail 발송에 강제 BCC로 붙는다.

### 답장 확인 파이프라인

[src/checkReplies.js](src/checkReplies.js)는 각 계정으로 headless 로그인 → `sendbird-badge` 엘리먼트 개수로 답장 수 집계 → `replies.json`에 계정 하나 끝날 때마다 실시간 기록(`partial: true`) → 완료 시 `partial: false`. UI는 이 플래그로 진행 상태 판단.

[server.js](server.js)의 node-cron이 매일 08:30/10:30/12:30/14:30에 자동 실행한다. `--start <username>` 인자로 특정 계정부터 순차 시작 가능.

### 로그인/로그아웃 공통 규약

[md/request.md](md/request.md)의 결정사항: 로그인·로그아웃 모두 반드시 캐시 비우기 + 새로고침을 수행한다. [src/auth.js](src/auth.js)가 이미 구현하고 있으니 인증 관련 코드를 만질 때는 이 규약을 깨지 말 것. 로그인 실패 시 새로고침 후 1회 재시도하는 것도 의도된 동작이다.

## 작업 진행 프로토콜 — [md/request.md](md/request.md)

이 저장소는 [md/request.md](md/request.md)에 요청사항을 적는 방식으로 협업한다. 규칙(파일 상단에 명시됨):

1. 요청 제목은 `## ` 으로 시작.
2. `[ 요청사항 ]` 밑에 새 요청이 들어오면 Claude는 먼저 `[ 실행계획 ]`에 계획을 추가만 한다 — **사용자가 "작업시작"이라고 하기 전에는 코드 수정 금지**.
3. 작업 시작하면 변경 코드에 해당 작업 내용 주석을 남긴다(예: `// [요청] ...`). `src/checkReplies.js`의 기존 주석이 이 패턴의 예시.
4. 작업 완료되면 `[ 요청사항 ]`의 해당 항목을 `[ 작업완료 ]` 상단으로 옮기고, 사용한 실행계획은 지운다.

이 프로토콜은 일반적인 CLAUDE.md 규범보다 우선한다. 특히 "작은 버그 수정이라도 승인 없이 건드리지 말 것"을 의미한다.

## 데이터 파일 스키마 (요약)

- `accounts.json`: 인포크 계정. `{id, username, password, weeklyTracking: {"YYYY-Www": n}}`
- `emailAccounts.json`: Gmail 계정 + 앱 비번 + 서명. `{id, email, appPassword, senderName, signature, signatureImage}`
- `products.json`: `{products: [{name, brandName, productName, campaignType, category, usp, offerMessage, photos[], mailSubject?}]}`. `name`은 인플루언서 행의 `productName`과 매칭되는 키.
- `influencers.json` / `influencers.csv`: `{nickname, profileUrl, productName}`. JSON이 비어있지 않으면 JSON 우선.
- `logs/sent.log`: append-only CSV(`timestamp,accountId,nickname,profileUrl,productName`). 재실행 중복 방지용이 아니라 감사 용도 — 중복 차단은 `weeklyTracking` 카운터로만 한다.
- `replies.json`, `failed.json`: 런타임 산출물. 지워도 무방.

## 주의사항

- `config.HEADLESS = false`가 기본 — 브라우저 창이 뜨는 건 의도다. 답장 확인만 `checkReplies.js` 내부에서 `headless: true`로 강제한다.
- 사진/서명 이미지 경로는 절대경로(Windows 스타일)로 `products.json`에 저장된다. 경로를 상대화하지 말 것.
- `products.json`에 없는 `productName`을 가진 인플루언서가 있으면 [src/index.js](src/index.js)가 `process.exit(1)` — 제품명 매칭은 엄격하다.
