# 주기적 정리 대상 체크리스트

시간이 지나면서 누적되는 데이터 / 파일 목록. 주기적으로(분기 1회 정도) 이 문서를 보고 필요한 항목을 `ModifyHistory.md`의 `[ 요청사항 ]`으로 옮겨 작업 요청.

현재 자동/수동으로 정리되는 것:
- `npm run cleanup-orphans` — Supabase Storage `product-photos` 버킷의 미참조 파일 제거 ([scripts/cleanupOrphanPhotos.js](../scripts/cleanupOrphanPhotos.js))

---

## 정리 후보 (우선순위 순)

### 1. `signatures` 버킷 orphan 정리  ⭐ 가장 쉬움
- **무엇**: Supabase Storage `signatures` 버킷에서 `email_accounts.signature_image_url`이 참조하지 않는 파일 제거.
- **왜 필요**: `cleanup-orphans`와 동일한 누적 문제. ModifyHistory.md에도 "signatures 버킷은 이번 작업 미포함, 후속 요청 시 같은 방식으로 추가 가능"으로 남아있음.
- **방법**: 기존 [scripts/cleanupOrphanPhotos.js](../scripts/cleanupOrphanPhotos.js)를 일반화해 버킷·참조테이블·컬럼을 인자로 받도록 확장하거나, 별도 스크립트로 복제.
- **주기**: 분기 1회 또는 이메일 계정 서명 이미지를 자주 교체할 때.

### 2. `sent_log` 테이블 retention  ⭐ 가장 빠르게 증식
- **무엇**: 발송 감사 로그. append-only로 정의되어 영구 누적 ([scripts/schema.sql:152](../scripts/schema.sql#L152)).
- **왜 필요**: 매일 발송 시 연 단위로 수천~수만 행. Supabase 무료 플랜 용량 압박 가능. UI 조회는 `limit 2000`만 걸려있어 더 옛날 행은 의미 없음 ([src/repo/sentLogRepo.js:24](../src/repo/sentLogRepo.js#L24)).
- **방법**: N일(예: 90/180일) 이상 된 행을 삭제하는 스크립트 또는 Supabase의 cron(pg_cron) 사용.
- **주기**: 분기 1회.

### 3. `reply_runs` + `replies` 테이블 retention
- **무엇**: 답장 확인 결과. node-cron이 매일 4회(08:30/10:30/12:30/14:30) 실행 → 1년에 ~1,460 runs × 계정수.
- **왜 필요**: UI는 가장 최근 run만 표시 ([src/repo/repliesRepo.js:71](../src/repo/repliesRepo.js#L71)). 그 이전 데이터는 활용처 없음.
- **방법**: 최근 N개 run만 유지하고 나머지 `reply_runs` 삭제. `replies`는 `on delete cascade`로 함께 정리됨.
- **주기**: 분기 1회.

### 4. `weekly_tracking` 테이블 정리
- **무엇**: `accounts × week_key` 단위로 카운터 행. 매주 계정수만큼 추가.
- **왜 필요**: 양은 작지만 1년 이상 지난 주차는 의미 없음. 주간 제한(`WEEKLY_LIMIT=10`) 판정엔 현재 주차만 필요.
- **방법**: 1년 이상 지난 `week_key` 삭제.
- **주기**: 연 1회 정도.

### 5. `influencers` 테이블의 종결 행 (`sent`/`skipped`)
- **무엇**: 발송이 끝나거나 스킵된 인플루언서 행이 무한 누적.
- **고려사항**: `failed`는 UI "재발송"용으로 유지 필요. `sent`/`skipped`는 archive 후 삭제 가능하나, 중복발송 방지/통계용으로 쓰일 수 있어 정책 결정이 먼저.
- **주기**: 정책 합의 후 분기 1회.

### 6. 로컬 `%TEMP%/inpock-photos/` 캐시
- **무엇**: [src/proposal.js:17-39](../src/proposal.js#L17-L39)의 다운로드 1회 캐시.
- **현재 상태**: OS 디스크 정리가 알아서 청소. 보통 비어있음.
- **방법**: 굳이 한다면 `mtime` N일 이상 된 파일 삭제.
- **주기**: 자동(OS) 위임. 수동은 불필요.

### 7. `assets/` 폴더 정리
- **무엇**: (1) 마이그레이션 전 레거시, (2) UI 신규 업로드 임시저장, (3) 제안서용 로컬 캐시 3역할 겸함.
- **위험**: [src/proposal.js](../src/proposal.js)의 `resolvePhotosToLocal()` 빠른 경로가 `assets/<basename>` 존재를 전제로 함. 무작정 지우면 매 발송마다 재다운로드.
- **방법**: Storage에 동일 basename이 있고 `product_photos` 참조가 살아있는 파일만 보존하는 별도 스크립트가 필요. 신중한 별도 작업.
- **주기**: 미정 (안전성 검토 후).

---

## 의사결정 메모
- "정리 = 즉시 영구삭제"가 기본이지만, 감사 로그(`sent_log`) 같은 항목은 archive(별도 테이블 이관) → 삭제 옵션도 검토 가능.
- 모든 신규 정리 스크립트는 `cleanupOrphanPhotos.js`처럼 **dry-run 기본 + `--force` 플래그**로 구현 권장.
