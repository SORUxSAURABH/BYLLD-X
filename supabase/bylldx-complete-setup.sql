-- ============================================================
-- BYLLD X — Run this entire script in Supabase SQL Editor
-- Step 1: Paste this, Step 2: Click "Run"
-- ============================================================

-- Base schema
create extension if not exists pgcrypto;

create type public.account_role as enum ('founder','investor','admin');
create type public.subscription_tier as enum ('free','premium');
create type public.idea_status as enum ('draft','active','inactive','removed');
create type public.request_status as enum ('pending','accepted','rejected','expired');
create type public.report_reason as enum ('spam','harassment','fraud_scam','fake_identity','inappropriate_content','stolen_content','other');
create type public.report_status as enum ('open','dismissed','actioned');
create type public.account_status as enum ('active','suspended','banned');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role public.account_role not null,
  account_status public.account_status not null default 'active',
  suspended_until timestamptz,
  onboarding_completed_at timestamptz,
  terms_accepted_at timestamptz not null default now(),
  privacy_accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suspension_has_end check (account_status <> 'suspended' or suspended_until is not null)
);

create table public.profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  headline text check (char_length(headline) <= 180),
  bio text check (char_length(bio) <= 2000),
  location text check (char_length(location) <= 160),
  photo_path text,
  website_url text,
  linkedin_url text,
  completion_percent smallint not null default 10 check (completion_percent between 0 and 100),
  is_discoverable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.founder_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  founder_role text,
  years_experience smallint check (years_experience between 0 and 80),
  prior_startups smallint not null default 0 check (prior_startups >= 0)
);

create table public.investor_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  investor_type text,
  min_investment_inr bigint check (min_investment_inr >= 0),
  max_investment_inr bigint check (max_investment_inr >= min_investment_inr),
  investment_thesis text check (char_length(investment_thesis) <= 2500)
);

create table public.industries (
  id bigint generated always as identity primary key,
  name text not null unique,
  slug text not null unique,
  is_active boolean not null default true
);

create table public.niches (
  id bigint generated always as identity primary key,
  industry_id bigint references public.industries(id) on delete set null,
  name text not null,
  slug text not null unique,
  is_active boolean not null default true
);

create table public.profile_niches (
  user_id uuid references public.users(id) on delete cascade,
  niche_id bigint references public.niches(id) on delete cascade,
  custom_label text,
  is_active boolean not null default true,
  priority smallint not null default 1 check (priority between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (user_id,niche_id),
  constraint custom_label_length check (custom_label is null or char_length(custom_label) between 2 and 80)
);

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  founder_id uuid not null references public.users(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  teaser text not null check (char_length(teaser) between 20 and 420),
  industry_id bigint references public.industries(id) on delete set null,
  niche_id bigint references public.niches(id) on delete set null,
  funding_requested_inr bigint not null check (funding_requested_inr >= 0),
  startup_stage text not null,
  status public.idea_status not null default 'draft',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.idea_details (
  idea_id uuid primary key references public.ideas(id) on delete cascade,
  founder_id uuid not null references public.users(id) on delete cascade,
  full_description text not null,
  problem text not null,
  proposed_solution text not null,
  supporting_details text,
  updated_at timestamptz not null default now()
);

create unique index idx_ideas_one_primary_per_founder on public.ideas(founder_id) where is_primary and status='active';
create index idx_ideas_discovery on public.ideas(status,industry_id,niche_id,created_at desc);

create table public.saved_profiles (
  owner_id uuid references public.users(id) on delete cascade,
  saved_user_id uuid references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(owner_id,saved_user_id),
  constraint cannot_save_self check(owner_id<>saved_user_id)
);

create table public.profile_views (
  viewer_id uuid references public.users(id) on delete cascade,
  viewed_user_id uuid references public.users(id) on delete cascade,
  week_start date not null,
  first_viewed_at timestamptz not null default now(),
  primary key(viewer_id,viewed_user_id,week_start),
  constraint cannot_view_self check(viewer_id<>viewed_user_id)
);

create table public.weekly_usage (
  user_id uuid references public.users(id) on delete cascade,
  week_start date not null,
  unique_profile_views smallint not null default 0 check(unique_profile_views between 0 and 7),
  connection_requests smallint not null default 0 check(connection_requests between 0 and 7),
  updated_at timestamptz not null default now(),
  primary key(user_id,week_start)
);

create table public.connection_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.users(id) on delete cascade,
  receiver_id uuid not null references public.users(id) on delete cascade,
  status public.request_status not null default 'pending',
  message text check (char_length(message)<=500),
  expires_at timestamptz not null default (now()+interval '7 days'),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint cannot_request_self check(sender_id<>receiver_id)
);
create unique index idx_one_pending_request_pair on public.connection_requests(least(sender_id,receiver_id),greatest(sender_id,receiver_id)) where status='pending';
create index idx_requests_receiver_status on public.connection_requests(receiver_id,status,created_at desc);
create index idx_requests_sender_status on public.connection_requests(sender_id,status,created_at desc);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_low_id uuid not null references public.users(id) on delete cascade,
  user_high_id uuid not null references public.users(id) on delete cascade,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  created_from_request_id uuid references public.connection_requests(id) on delete set null,
  unique(user_low_id,user_high_id),
  constraint canonical_connection_pair check(user_low_id::text<user_high_id::text)
);

create table public.blocks (
  blocker_id uuid references public.users(id) on delete cascade,
  blocked_id uuid references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id),
  constraint cannot_block_self check(blocker_id<>blocked_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null unique references public.connections(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  reply_to_id uuid references public.messages(id) on delete set null,
  body text not null check(char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index idx_messages_conversation_created on public.messages(conversation_id,created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  reference_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notifications_user_unread on public.notifications(user_id,created_at desc) where read_at is null;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users(id) on delete cascade,
  reported_user_id uuid references public.users(id) on delete cascade,
  reported_idea_id uuid references public.ideas(id) on delete set null,
  reason public.report_reason not null,
  details text check(char_length(details)<=2000),
  status public.report_status not null default 'open',
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint report_has_target check(num_nonnulls(reported_user_id,reported_idea_id)=1)
);
create index idx_reports_queue on public.reports(status,created_at);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  tier public.subscription_tier not null default 'free',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  constraint premium_has_period check(tier='free' or (starts_at is not null and ends_at>starts_at))
);
create index idx_subscriptions_user_period on public.subscriptions(user_id,ends_at desc);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  provider text not null default 'mock',
  provider_payment_id text,
  amount_inr integer not null check(amount_inr in (240,310)),
  status text not null check(status in ('created','successful','failed')),
  idempotency_key text not null unique,
  receipt_number text unique,
  receipt_payload jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index idx_payments_user_created on public.payments(user_id,created_at desc);

create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.users(id) on delete restrict,
  target_user_id uuid references public.users(id) on delete set null,
  target_idea_id uuid references public.ideas(id) on delete set null,
  action text not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_admin_actions_target_user on public.admin_actions(target_user_id,created_at desc);

create table public.presence (
  user_id uuid primary key references public.users(id) on delete cascade,
  is_online boolean not null default false,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create user row when someone signs up via Supabase Auth
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_role public.account_role;
begin
  v_role := coalesce(
    (new.raw_user_meta_data->>'role')::public.account_role,
    'founder'::public.account_role
  );
  insert into public.users(id, email, role)
  values (new.id, new.email, v_role)
  on conflict(id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role is permanent
create function public.prevent_role_change() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.role<>old.role then raise exception 'account role is permanent'; end if;
  return new;
end;$$;
create trigger users_role_immutable before update of role on public.users for each row execute function public.prevent_role_change();

create function public.is_admin() returns boolean language sql stable security invoker set search_path='' as $$
  select coalesce(((select auth.jwt())->'app_metadata'->>'role')='admin',false)
$$;

-- RPC: insert a message (bypasses the revoke on authenticated role)
create or replace function public.insert_message(
  p_conversation_id uuid,
  p_sender_id uuid,
  p_body text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  insert into public.messages(conversation_id, sender_id, body)
  values (p_conversation_id, p_sender_id, p_body)
  returning id into v_id;
  return v_id;
end;
$$;

-- RPC: insert a pending payment record
create or replace function public.insert_payment(
  p_user_id uuid,
  p_provider text,
  p_provider_payment_id text,
  p_amount_inr integer,
  p_idempotency_key text
) returns void language plpgsql security definer set search_path='' as $$
begin
  insert into public.payments(user_id, provider, provider_payment_id, amount_inr, status, idempotency_key)
  values (p_user_id, p_provider, p_provider_payment_id, p_amount_inr, 'created', p_idempotency_key)
  on conflict(idempotency_key) do nothing;
end;
$$;

-- RPC: confirm a payment after Razorpay webhook
create or replace function public.confirm_payment(
  p_provider_payment_id text,
  p_razorpay_payment_id text
) returns void language plpgsql security definer set search_path='' as $$
begin
  update public.payments
  set status='successful', provider_payment_id=p_razorpay_payment_id, paid_at=now()
  where provider_payment_id=p_provider_payment_id;
end;
$$;

-- RPC: activate premium subscription
create or replace function public.activate_subscription(
  p_user_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
) returns void language plpgsql security definer set search_path='' as $$
begin
  insert into public.subscriptions(user_id, tier, starts_at, ends_at)
  values (p_user_id, 'premium', p_starts_at, p_ends_at);
end;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.founder_profiles enable row level security;
alter table public.investor_profiles enable row level security;
alter table public.industries enable row level security;
alter table public.niches enable row level security;
alter table public.profile_niches enable row level security;
alter table public.ideas enable row level security;
alter table public.idea_details enable row level security;
alter table public.saved_profiles enable row level security;
alter table public.profile_views enable row level security;
alter table public.weekly_usage enable row level security;
alter table public.connection_requests enable row level security;
alter table public.connections enable row level security;
alter table public.blocks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.admin_actions enable row level security;
alter table public.presence enable row level security;

grant usage on schema public to authenticated;
revoke all on all tables in schema public from anon;
grant select on public.industries,public.niches to authenticated;
grant select,insert,update,delete on public.profiles,public.founder_profiles,public.investor_profiles,public.profile_niches,public.ideas,public.idea_details,public.saved_profiles,public.connection_requests,public.blocks,public.messages,public.notifications,public.reports,public.presence to authenticated;
grant select on public.users,public.profile_views,public.weekly_usage,public.connections,public.conversations,public.subscriptions,public.payments to authenticated;
revoke all on public.admin_actions from anon,authenticated;
grant usage,select on all sequences in schema public to authenticated;

create policy users_self_select on public.users for select to authenticated using(id=(select auth.uid()) or public.is_admin());
create policy profiles_member_select on public.profiles for select to authenticated using(is_discoverable or user_id=(select auth.uid()) or public.is_admin());
create policy profiles_self_insert on public.profiles for insert to authenticated with check(user_id=(select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy founder_profiles_member_select on public.founder_profiles for select to authenticated using(true);
create policy founder_profiles_self_write on public.founder_profiles for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy investor_profiles_member_select on public.investor_profiles for select to authenticated using(true);
create policy investor_profiles_self_write on public.investor_profiles for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy industries_member_read on public.industries for select to authenticated using(is_active);
create policy niches_member_read on public.niches for select to authenticated using(is_active);
create policy profile_niches_member_read on public.profile_niches for select to authenticated using(true);
create policy profile_niches_self_write on public.profile_niches for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy ideas_member_read_teaser on public.ideas for select to authenticated using(status='active' or founder_id=(select auth.uid()) or public.is_admin());
create policy ideas_founder_write on public.ideas for all to authenticated using(founder_id=(select auth.uid())) with check(founder_id=(select auth.uid()));
create policy idea_details_connected_read on public.idea_details for select to authenticated using(
  founder_id=(select auth.uid()) or public.is_admin() or exists(
    select 1 from public.connections c where c.disconnected_at is null and ((c.user_low_id=(select auth.uid()) and c.user_high_id=founder_id) or (c.user_high_id=(select auth.uid()) and c.user_low_id=founder_id))
  )
);
create policy idea_details_founder_write on public.idea_details for all to authenticated using(founder_id=(select auth.uid())) with check(founder_id=(select auth.uid()));
create policy saved_profiles_owner_all on public.saved_profiles for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy profile_views_owner_read on public.profile_views for select to authenticated using(viewer_id=(select auth.uid()) or public.is_admin());
create policy weekly_usage_owner_read on public.weekly_usage for select to authenticated using(user_id=(select auth.uid()) or public.is_admin());
create policy requests_participant_read on public.connection_requests for select to authenticated using(sender_id=(select auth.uid()) or receiver_id=(select auth.uid()) or public.is_admin());
create policy requests_sender_insert on public.connection_requests for insert to authenticated with check(sender_id=(select auth.uid()));
create policy requests_receiver_update on public.connection_requests for update to authenticated using(receiver_id=(select auth.uid())) with check(receiver_id=(select auth.uid()));
create policy connections_participant_read on public.connections for select to authenticated using(user_low_id=(select auth.uid()) or user_high_id=(select auth.uid()) or public.is_admin());
create policy blocks_owner_all on public.blocks for all to authenticated using(blocker_id=(select auth.uid())) with check(blocker_id=(select auth.uid()));
create policy conversations_participant_read on public.conversations for select to authenticated using(exists(select 1 from public.connections c where c.id=connection_id and (c.user_low_id=(select auth.uid()) or c.user_high_id=(select auth.uid()))));
create policy messages_participant_read on public.messages for select to authenticated using(exists(select 1 from public.conversations cv join public.connections c on c.id=cv.connection_id where cv.id=conversation_id and (c.user_low_id=(select auth.uid()) or c.user_high_id=(select auth.uid()))));
create policy notifications_owner_read on public.notifications for select to authenticated using(user_id=(select auth.uid()));
create policy notifications_owner_update on public.notifications for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy reports_reporter_insert on public.reports for insert to authenticated with check(reporter_id=(select auth.uid()));
create policy reports_reporter_read on public.reports for select to authenticated using(reporter_id=(select auth.uid()) or public.is_admin());
create policy subscriptions_owner_read on public.subscriptions for select to authenticated using(user_id=(select auth.uid()) or public.is_admin());
create policy payments_owner_read on public.payments for select to authenticated using(user_id=(select auth.uid()) or public.is_admin());
create policy presence_member_read on public.presence for select to authenticated using(true);
create policy presence_self_write on public.presence for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

revoke insert,update,delete on public.messages from authenticated;
revoke insert,update,delete on public.connection_requests from authenticated;
revoke insert,update,delete on public.connections,public.conversations,public.profile_views,public.weekly_usage,public.subscriptions,public.payments from authenticated;

-- ============================================================
-- SEED DATA — Industries & Niches
-- ============================================================

insert into public.industries(name,slug) values
('Artificial Intelligence','artificial-intelligence'),
('Agriculture','agriculture'),
('Climate & Energy','climate-energy'),
('Fintech','fintech'),
('Healthtech','healthtech'),
('Enterprise Software','enterprise-software'),
('Consumer','consumer'),
('Edtech','edtech'),
('Logistics','logistics'),
('Real Estate','real-estate');

insert into public.niches(industry_id,name,slug)
select id,'Machine Learning','machine-learning' from public.industries where slug='artificial-intelligence'
union all select id,'Generative AI','generative-ai' from public.industries where slug='artificial-intelligence'
union all select id,'Smallholder Intelligence','smallholder-intelligence' from public.industries where slug='agriculture'
union all select id,'Clean Energy','clean-energy' from public.industries where slug='climate-energy'
union all select id,'Payments','payments' from public.industries where slug='fintech'
union all select id,'Lending','lending' from public.industries where slug='fintech'
union all select id,'Diagnostics','diagnostics' from public.industries where slug='healthtech'
union all select id,'B2B SaaS','b2b-saas' from public.industries where slug='enterprise-software'
union all select id,'Consumer Care','consumer-care' from public.industries where slug='consumer'
union all select id,'D2C','d2c' from public.industries where slug='consumer';

select pg_catalog.set_config('search_path','',false);
