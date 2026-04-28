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
-- 8. reply_runs + replies : 답장 확인 결과
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
-- 9. settings : key-value (mailBcc, adminPassword 등)
------------------------------------------------------------
create table if not exists settings (
  key         text        primary key,
  value       jsonb       not null,
  updated_at  timestamptz not null default now()
);

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
