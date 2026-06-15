-- [요청] Supabase 메인 DB 이전 — 전체 스키마 DDL
-- 사용법: Supabase Dashboard → SQL Editor에 통째로 붙여넣고 [Run] 클릭.
-- 이미 실행된 적이 있어도 안전하도록 모든 DDL에 IF NOT EXISTS / OR REPLACE 사용.

------------------------------------------------------------
-- 1. accounts : 인포크링크 계정
------------------------------------------------------------
create table if not exists accounts (
  id          serial      primary key,
  username    text        not null unique,
  password    text        not null,
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);

------------------------------------------------------------
-- 2. weekly_tracking : 주간 발송 카운터 (accounts 1:N)
--    핵심: JSON이 아닌 별도 테이블로 빼서 UPSERT로 원자적 +1 가능
------------------------------------------------------------
create table if not exists weekly_tracking (
  account_id  int         not null references accounts(id) on delete cascade,
  week_key    text        not null,                          -- 예: '2026-W17'
  count       int         not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (account_id, week_key)
);

-- 주간 카운터 원자적 증가 RPC.
--   supabase.rpc('increment_weekly_count', { p_account_id: 1, p_week_key: '2026-W17' })
-- 호출하면 새 count 값을 반환.
create or replace function increment_weekly_count(p_account_id int, p_week_key text)
returns int
language plpgsql
as $$
declare
  new_count int;
begin
  insert into weekly_tracking(account_id, week_key, count)
  values (p_account_id, p_week_key, 1)
  on conflict (account_id, week_key)
  do update set count = weekly_tracking.count + 1,
                updated_at = now()
  returning count into new_count;
  return new_count;
end;
$$;

-- [요청] 주간 카운트 강제 증감 — 수동 발송 보정용 원자적 ±delta RPC.
--   supabase.rpc('adjust_weekly_count', { p_account_id: 1, p_week_key: '2026-W17', p_delta: -1 })
-- count는 0 미만으로 내려가지 않도록 greatest(..., 0)으로 클램프.
-- 운영 DB에는 SQL Editor에서 이 함수 1회 실행 필요.
create or replace function adjust_weekly_count(p_account_id int, p_week_key text, p_delta int)
returns int
language plpgsql
as $$
declare
  new_count int;
begin
  insert into weekly_tracking(account_id, week_key, count)
  values (p_account_id, p_week_key, greatest(p_delta, 0))
  on conflict (account_id, week_key)
  do update set count = greatest(weekly_tracking.count + p_delta, 0),
                updated_at = now()
  returning count into new_count;
  return new_count;
end;
$$;

------------------------------------------------------------
-- 3. email_accounts : Gmail 발송 계정
------------------------------------------------------------
create table if not exists email_accounts (
  id                   serial      primary key,
  email                text        not null unique,
  app_password         text        not null,
  sender_name          text        not null,
  signature            text,
  signature_image_url  text,       -- Supabase Storage public URL
  active               boolean     not null default true,
  created_at           timestamptz not null default now()
);

------------------------------------------------------------
-- 4. products : 제품 마스터
------------------------------------------------------------
-- [요청] 제품 목록 필드 확장 — hooking_phrases ~ age_range 컬럼 추가
create table if not exists products (
  id                     serial      primary key,
  name                   text        not null unique,    -- influencers.product_name 매칭 키
  brand_name             text,
  product_name           text,
  campaign_type          text,
  category               text,
  mail_subject           text,
  usp                    text,
  offer_message          text,
  hooking_phrases        text[]      not null default '{}',
  product_link           text,
  announce_example_link  text,
  announce_example_owner text,
  hurdle                 text,
  schedule               text,
  memo                   text,
  age_range              text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

------------------------------------------------------------
-- 5. product_photos : 제품 사진 (Supabase Storage URL)
------------------------------------------------------------
create table if not exists product_photos (
  id          serial      primary key,
  product_id  int         not null references products(id) on delete cascade,
  url         text        not null,
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_product_photos_product
  on product_photos(product_id, sort_order);

------------------------------------------------------------
-- 6. influencers : 발송 큐 + 실패 기록 통합
--    기존 influencers.json / failed.json 을 하나의 테이블로 합침.
--    status: pending(대기) / sent(완료) / failed(실패) / skipped('x' URL 등)
------------------------------------------------------------
-- [요청] 발송 중 크래시 대비 — 'sending' 중간 상태 추가
create table if not exists influencers (
  id            serial      primary key,
  nickname      text        not null,
  profile_url   text        not null,
  product_name  text        not null,
  status        text        not null default 'pending'
                check (status in ('pending','sent','failed','skipped','sending')),
  error         text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_influencers_status on influencers(status);

-- [요청] 발송 중 크래시 대비 — 기존 테이블용 마이그레이션
--   이미 배포된 DB는 위의 create table if not exists가 no-op이므로,
--   아래 ALTER를 SQL Editor에서 한 번 실행해야 'sending' 상태가 허용됨.
alter table influencers drop constraint if exists influencers_status_check;
alter table influencers add constraint influencers_status_check
  check (status in ('pending','sent','failed','skipped','sending'));

------------------------------------------------------------
-- 7. sent_log : 감사 로그 (append-only)
------------------------------------------------------------
create table if not exists sent_log (
  id            bigserial   primary key,
  account_id    int         references accounts(id) on delete set null,
  nickname      text,
  profile_url   text,
  product_name  text,
  sent_at       timestamptz not null default now()
);

create index if not exists idx_sent_log_time on sent_log(sent_at desc);

------------------------------------------------------------
-- 8. reply_runs + replies : 인포크 확인 결과 (구 답장 확인)
--    한 run은 모든 계정 순회를 의미. finished_at IS NULL 이면 '진행 중(partial)'.
------------------------------------------------------------
create table if not exists reply_runs (
  id           uuid        primary key default gen_random_uuid(),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  note         text
);

create table if not exists replies (
  id                bigserial   primary key,
  run_id            uuid        not null references reply_runs(id) on delete cascade,
  account_username  text        not null,
  reply_count       int         not null default 0,
  error             text,
  checked_at        timestamptz not null default now()
);

create index if not exists idx_replies_run on replies(run_id, checked_at);

------------------------------------------------------------
-- 9. leads : 답장 온 인플루언서 추적 (리드 관리)
--   [요청] 리드 관리 탭 신설 (답장 온 인플루언서 추적)
--   - replied_at: 인플루언서가 관심있다고 연락 온 날짜
--   - proposal_sent_at: 제안서 발송일
--   - remind_at: 리마인드 필요일 (기본 = proposal_sent_at + 3일, 사용자 override 가능)
--   - final_status: pending / 거절 / 공구진행 / 무응답
--   - interested_product_name: 관심 보인 제품 이름 (FK 안 검 — 제품 리네임/삭제와 분리)
--   - suitable_product_note: 어울릴만한 제품 (포맷 미정, 자유 텍스트)
------------------------------------------------------------
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
  -- [요청] 리드 관리 — 카톡전환 컬럼/체크박스 + 표에 메모란 노출
  collaboration_converted  boolean     not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_leads_remind
  on leads(final_status, remind_at);

------------------------------------------------------------
-- 10. settings : key-value (mailBcc, adminPassword 등)
------------------------------------------------------------
create table if not exists settings (
  key         text        primary key,
  value       jsonb       not null,
  updated_at  timestamptz not null default now()
);

------------------------------------------------------------
-- 11. catalogs : 인플루언서 맞춤 추천 카탈로그
--   [요청] 추천 카탈로그 페이지 — 인플루언서별 큐레이션 공유 링크
--   - code: 공개 URL용 short code (6~8자리 base64url). 이 값으로만 외부 조회 가능.
--   - product_ids: 선택된 제품 id 배열 (JSONB). 드래그로 정한 순서가 그대로 노출 순서.
--   - lead_id: 선택적 리드 연결 (nullable). 리드 외 임의 닉네임도 허용.
--   - 한 인플루언서에게 N개 카탈로그 가능 (unique 제약 없음, 차수별/시즌별 변형 의도된 패턴).
------------------------------------------------------------
create table if not exists catalogs (
  id                   serial      primary key,
  code                 text        not null unique,
  title                text,
  influencer_nickname  text        not null,
  lead_id              int         references leads(id) on delete set null,
  product_ids          jsonb       not null default '[]'::jsonb,
  view_count           int         not null default 0,
  viewed_at            timestamptz,
  created_at           timestamptz not null default now()
);

create index if not exists idx_catalogs_code      on catalogs(code);
create index if not exists idx_catalogs_nickname  on catalogs(influencer_nickname);

-- [요청] 추천 카탈로그 페이지 — 공개 URL용 RPC
--   Vercel 배포된 공개 페이지가 anon 키로 이 함수만 호출. SECURITY DEFINER로 RLS 우회.
--   code 일치 시 view_count +1, viewed_at 갱신, 제품+사진을 product_ids 순서대로 JSON 반환.
--   미존재 시 null 반환.
create or replace function get_catalog_by_code(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  cat catalogs%rowtype;
  result json;
begin
  update catalogs
     set view_count = view_count + 1,
         viewed_at = now()
   where code = p_code
  returning * into cat;

  if not found then
    return null;
  end if;

  with ordered_ids as (
    select t.elem::int as pid, t.idx as ord
      from jsonb_array_elements_text(cat.product_ids) with ordinality as t(elem, idx)
  ),
  prods as (
    select
      p.id, p.name, p.brand_name, p.product_name, p.campaign_type,
      p.category, p.usp, p.offer_message, p.product_link,
      p.announce_example_link, p.memo, p.age_range,
      o.ord,
      coalesce(
        (select json_agg(pp.url order by pp.sort_order)
           from product_photos pp where pp.product_id = p.id),
        '[]'::json
      ) as photos
    from products p
    join ordered_ids o on o.pid = p.id
  )
  select json_build_object(
    'code',               cat.code,
    'title',              cat.title,
    'influencerNickname', cat.influencer_nickname,
    'viewCount',          cat.view_count,
    'products', coalesce(
      (select json_agg(
        json_build_object(
          'id',                  id,
          'name',                name,
          'brandName',           brand_name,
          'productName',         product_name,
          'campaignType',        campaign_type,
          'category',            category,
          'usp',                 usp,
          'offerMessage',        offer_message,
          'productLink',         product_link,
          'announceExampleLink', announce_example_link,
          'memo',                memo,
          'ageRange',            age_range,
          'photos',              photos
        ) order by ord
      ) from prods),
      '[]'::json
    )
  ) into result;

  return result;
end;
$$;

-- anon 역할은 RPC 실행만 허용 (테이블 직접 SELECT 차단됨)
grant execute on function get_catalog_by_code(text) to anon;

-- catalogs/products/product_photos에 RLS 활성화.
--   anon은 정책이 없어서 직접 SELECT 불가, RPC(SECURITY DEFINER)만 통과.
--   service_role은 RLS 항상 우회 → 기존 server.js/admin UI 동작 무영향.
alter table catalogs       enable row level security;
alter table products       enable row level security;
alter table product_photos enable row level security;

-- [요청] 제품 목록 필드 확장 — 기존 테이블용 마이그레이션
--   이미 배포된 DB는 위의 create table if not exists가 no-op이므로,
--   아래 ALTER를 SQL Editor에서 한 번 실행해야 새 컬럼이 추가됨.
alter table products add column if not exists hooking_phrases        text[] not null default '{}';
alter table products add column if not exists product_link           text;
alter table products add column if not exists announce_example_link  text;
alter table products add column if not exists announce_example_owner text;
alter table products add column if not exists hurdle                 text;
alter table products add column if not exists schedule               text;
alter table products add column if not exists memo                   text;
alter table products add column if not exists age_range              text;

-- [요청] 제안 메시지 분리 — 기존 테이블용 마이그레이션
alter table products add column if not exists suggest_new_influencer      text;
alter table products add column if not exists suggest_existing_influencer text;

-- [요청] 리드 관리 — 카톡전환 컬럼/체크박스 + 표에 메모란 노출
alter table leads add column if not exists collaboration_converted boolean not null default false;

-- [요청] 자주 사용하는 문구 — 직원별 추가/복사 탭 신설
--   employees: 독립 범용 직원 테이블. 지금은 phrases가 참조하지만,
--   향후 다른 테이블(발송 계정 담당자, 리드 담당자 등)에서도 employee_id로 재사용 예정.
--   phrases: 직원별 자주 쓰는 문구(메모). employee 삭제 시 cascade로 함께 삭제.
--   create table if not exists 라 정의 겸 마이그레이션(기존 DB는 이 블록만 SQL Editor 1회 실행).
create table if not exists employees (
  id          serial      primary key,
  name        text        not null,
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists phrases (
  id           serial      primary key,
  employee_id  int         not null references employees(id) on delete cascade,
  title        text,
  content      text        not null,
  sort_order   int         not null default 0,
  -- [요청] 직원별 최대 3개 최상단 고정 — pinned 우선 정렬, 3개 제한은 앱(phrasesRepo.setPinned)에서 강제.
  pinned       boolean     not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists idx_phrases_employee on phrases(employee_id, sort_order);

-- [요청] 직원별 문구 고정 — 기존 테이블용 마이그레이션 (이미 배포된 DB는 위 create가 no-op이라 1회 실행 필요).
alter table phrases add column if not exists pinned boolean not null default false;

------------------------------------------------------------
-- 12. manufacturers : 제조사 마스터
--   [요청] 제조사 관리 기능 — 제조사 추가 → 제품 추가 흐름
--   - 제품(products)이 manufacturer_id로 참조. 제조사 선택 시 brand_name 자동 채움(UI).
--   - 허들/일정/메모는 제조사 기본값 → 제품에 상속(제품 단위 override 가능).
--   - 담당자(contact_person)/연락처(contact)는 제조사 전용 필드.
--   - status: 빈값('')=진행 / '협업종료'. 협업종료 시 연결된 제품 status도 함께 '협업종료'(앱에서 캐스케이드).
------------------------------------------------------------
create table if not exists manufacturers (
  id              serial      primary key,
  name            text        not null unique,
  contact_person  text,
  contact         text,
  hurdle          text,
  schedule        text,
  memo            text,
  status          text        not null default '',   -- '' = 진행, '협업종료'
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- [요청] 제조사 관리 — products에 제조사 FK + 협업종료 status 컬럼 추가.
--   manufacturers를 위에서 먼저 생성하므로 이 ALTER가 안전하게 참조 가능.
--   on delete set null: 제조사 실삭제는 드묾(협업종료가 정상 경로). 만약 삭제돼도 제품은 보존.
--   ⚠️ 이미 배포된 운영 DB는 이 블록(12번)을 SQL Editor에서 1회 실행해야 함.
alter table products add column if not exists manufacturer_id int references manufacturers(id) on delete set null;
alter table products add column if not exists status text not null default '';   -- '' = 진행, '협업종료'
create index if not exists idx_products_manufacturer on products(manufacturer_id);
