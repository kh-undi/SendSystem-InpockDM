1. 요청사항 제목시작을 '## ' 으로 시작함.
2. 요청사항을 읽고 '실행계획' 영역에 작업할 내용을 추가함. 그 전까지 클로드코드는 작업시작 명령 없이 코드수정을 하지 않음
3. 작업시작하면 코드에 작업내용 주석추가
4. 요청사항 작업이 끝나면 '요청사항' 내용을 '작업완료' 상단으로 이동시킨다. 
5. 수행한 실행계획 내용은 지운다. 

[ 요청사항 ]

[ 실행계획 ]

[ 작업완료 ]
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

