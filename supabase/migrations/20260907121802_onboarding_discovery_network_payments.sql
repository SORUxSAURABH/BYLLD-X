-- Complete the profile model used by onboarding.
alter table public.profiles
  add column phone text check (phone is null or char_length(phone) <= 32);

alter table public.founder_profiles
  add column startup_name text check (startup_name is null or char_length(startup_name) <= 160),
  add column industry text check (industry is null or char_length(industry) <= 120),
  add column startup_stage text check (startup_stage is null or startup_stage in ('idea', 'mvp', 'early_revenue', 'scaling')),
  add column startup_pitch text check (startup_pitch is null or char_length(startup_pitch) <= 420);

alter table public.investor_profiles
  add column firm_name text check (firm_name is null or char_length(firm_name) <= 160),
  add column sectors_of_interest text check (sectors_of_interest is null or char_length(sectors_of_interest) <= 1000),
  add column typical_check_size_inr bigint check (typical_check_size_inr is null or typical_check_size_inr >= 0);

-- Enforce active-idea tier limits at the database boundary as well as in the API.
-- This closes race conditions and prevents direct table writes from bypassing limits.
create or replace function public.enforce_active_idea_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.account_role;
  v_active_count integer;
  v_max_active integer;
begin
  select role into v_role from public.users where id = new.founder_id;
  if v_role is distinct from 'founder'::public.account_role then
    raise exception 'only founder accounts can manage ideas';
  end if;

  if new.is_primary and new.status <> 'active' then
    raise exception 'only an active idea can be primary';
  end if;
  if new.status <> 'active' then
    return new;
  end if;

  select case when exists (
    select 1 from public.subscriptions
    where user_id = new.founder_id
      and tier = 'premium'
      and starts_at <= now()
      and ends_at > now()
  ) then 5 else 3 end into v_max_active;

  select count(*) into v_active_count
  from public.ideas
  where founder_id = new.founder_id
    and status = 'active'
    and id <> new.id;

  if v_active_count >= v_max_active then
    raise exception 'active idea limit reached (%)', v_max_active;
  end if;
  return new;
end;
$$;

drop trigger if exists ideas_enforce_active_limit on public.ideas;
create trigger ideas_enforce_active_limit
  before insert or update on public.ideas
  for each row execute function public.enforce_active_idea_limit();

revoke execute on function public.enforce_active_idea_limit() from public, anon, authenticated;

-- Existing substantially completed profiles should not be forced through onboarding again.
update public.users as u
set onboarding_completed_at = coalesce(u.onboarding_completed_at, p.updated_at, now())
from public.profiles as p
where p.user_id = u.id
  and u.onboarding_completed_at is null
  and p.completion_percent >= 85;

-- Sanitize the role copied from user metadata. Metadata is useful for initial account
-- setup, but it is never trusted for authorization or allowed to create admin users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.account_role;
begin
  v_role := case new.raw_user_meta_data ->> 'role'
    when 'investor' then 'investor'::public.account_role
    else 'founder'::public.account_role
  end;

  insert into public.users (id, email, role)
  values (new.id, new.email, v_role)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A member may choose their initial Founder/Investor role until onboarding is
-- completed. After that timestamp is set, the role is immutable.
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.role = 'admin' and old.role <> 'admin' then
    raise exception 'admin role cannot be self-assigned';
  end if;

  if old.onboarding_completed_at is not null and new.role <> old.role then
    raise exception 'account role is permanent after onboarding';
  end if;

  return new;
end;
$$;

grant update (role, onboarding_completed_at, updated_at) on public.users to authenticated;

drop policy if exists users_self_onboarding_update on public.users;
create policy users_self_onboarding_update
on public.users
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id and role in ('founder', 'investor'));

drop policy if exists profiles_member_select on public.profiles;
create policy profiles_member_select
on public.profiles
for select
to authenticated
using (
  is_discoverable
  or user_id = (select auth.uid())
  or public.is_admin()
  or exists (
    select 1 from public.connections as c
    where c.disconnected_at is null
      and ((c.user_low_id = (select auth.uid()) and c.user_high_id = user_id)
        or (c.user_high_id = (select auth.uid()) and c.user_low_id = user_id))
  )
  or exists (
    select 1 from public.connection_requests as r
    where r.status = 'pending'
      and ((r.sender_id = (select auth.uid()) and r.receiver_id = user_id)
        or (r.receiver_id = (select auth.uid()) and r.sender_id = user_id))
  )
);

-- Count a unique profile open atomically and enforce the Free weekly limit.
create or replace function public.record_profile_view(p_viewed_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := (select auth.uid());
  v_viewer_role public.account_role;
  v_target_role public.account_role;
  v_week_start date := date_trunc('week', timezone('utc', now()))::date;
  v_count smallint;
  v_inserted integer;
  v_is_premium boolean;
begin
  if v_viewer_id is null then
    raise exception 'authentication required';
  end if;
  if p_viewed_user_id is null or p_viewed_user_id = v_viewer_id then
    raise exception 'invalid profile';
  end if;

  select role into v_viewer_role from public.users where id = v_viewer_id;
  select u.role into v_target_role
  from public.users as u
  join public.profiles as p on p.user_id = u.id
  where u.id = p_viewed_user_id
    and u.onboarding_completed_at is not null
    and p.is_discoverable;

  if v_target_role is null
    or v_target_role = 'admin'
    or v_target_role = v_viewer_role then
    raise exception 'profile is not available';
  end if;

  select exists (
    select 1
    from public.subscriptions
    where user_id = v_viewer_id
      and tier = 'premium'
      and starts_at <= now()
      and ends_at > now()
  ) into v_is_premium;

  if v_is_premium then
    return jsonb_build_object('allowed', true, 'isPremium', true, 'remaining', null);
  end if;

  insert into public.weekly_usage (user_id, week_start)
  values (v_viewer_id, v_week_start)
  on conflict (user_id, week_start) do nothing;

  select unique_profile_views into v_count
  from public.weekly_usage
  where user_id = v_viewer_id and week_start = v_week_start
  for update;

  if exists (
    select 1 from public.profile_views
    where viewer_id = v_viewer_id
      and viewed_user_id = p_viewed_user_id
      and week_start = v_week_start
  ) then
    return jsonb_build_object('allowed', true, 'isPremium', false, 'remaining', greatest(0, 7 - v_count));
  end if;

  if v_count >= 7 then
    return jsonb_build_object('allowed', false, 'isPremium', false, 'remaining', 0);
  end if;

  insert into public.profile_views (viewer_id, viewed_user_id, week_start)
  values (v_viewer_id, p_viewed_user_id, v_week_start)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    update public.weekly_usage
    set unique_profile_views = unique_profile_views + 1,
        updated_at = now()
    where user_id = v_viewer_id and week_start = v_week_start
    returning unique_profile_views into v_count;
  end if;

  return jsonb_build_object('allowed', true, 'isPremium', false, 'remaining', greatest(0, 7 - v_count));
end;
$$;

-- Create connection requests atomically and enforce the Free weekly limit.
create or replace function public.send_connection_request(p_receiver_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender_id uuid := (select auth.uid());
  v_sender_role public.account_role;
  v_receiver_role public.account_role;
  v_week_start date := date_trunc('week', timezone('utc', now()))::date;
  v_count smallint;
  v_request_id uuid;
  v_is_premium boolean;
begin
  if v_sender_id is null then
    raise exception 'authentication required';
  end if;
  if p_receiver_id is null or p_receiver_id = v_sender_id then
    raise exception 'invalid receiver';
  end if;

  select role into v_sender_role from public.users where id = v_sender_id;
  select u.role into v_receiver_role
  from public.users as u
  join public.profiles as p on p.user_id = u.id
  where u.id = p_receiver_id
    and u.onboarding_completed_at is not null
    and p.is_discoverable;

  if v_receiver_role is null
    or v_receiver_role = 'admin'
    or v_receiver_role = v_sender_role then
    raise exception 'receiver is not available';
  end if;

  if exists (
    select 1 from public.connections
    where disconnected_at is null
      and ((user_low_id = v_sender_id and user_high_id = p_receiver_id)
        or (user_low_id = p_receiver_id and user_high_id = v_sender_id))
  ) then
    raise exception 'already connected';
  end if;

  if exists (
    select 1 from public.connection_requests
    where status = 'pending'
      and ((sender_id = v_sender_id and receiver_id = p_receiver_id)
        or (sender_id = p_receiver_id and receiver_id = v_sender_id))
  ) then
    raise exception 'connection request already pending';
  end if;

  select exists (
    select 1 from public.subscriptions
    where user_id = v_sender_id
      and tier = 'premium'
      and starts_at <= now()
      and ends_at > now()
  ) into v_is_premium;

  if not v_is_premium then
    insert into public.weekly_usage (user_id, week_start)
    values (v_sender_id, v_week_start)
    on conflict (user_id, week_start) do nothing;

    select connection_requests into v_count
    from public.weekly_usage
    where user_id = v_sender_id and week_start = v_week_start
    for update;

    if v_count >= 7 then
      raise exception 'weekly connection request limit reached';
    end if;
  end if;

  insert into public.connection_requests (sender_id, receiver_id)
  values (v_sender_id, p_receiver_id)
  returning id into v_request_id;

  if not v_is_premium then
    update public.weekly_usage
    set connection_requests = connection_requests + 1,
        updated_at = now()
    where user_id = v_sender_id and week_start = v_week_start;
  end if;

  return v_request_id;
end;
$$;

-- Accepting a request creates the canonical connection and conversation in the
-- same transaction. Rejecting only changes the request state.
create or replace function public.respond_connection_request(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receiver_id uuid := (select auth.uid());
  v_request public.connection_requests%rowtype;
  v_connection_id uuid;
begin
  if v_receiver_id is null then
    raise exception 'authentication required';
  end if;

  select * into v_request
  from public.connection_requests
  where id = p_request_id
    and receiver_id = v_receiver_id
    and status = 'pending'
    and expires_at > now()
  for update;

  if not found then
    raise exception 'pending request not found';
  end if;

  if not p_accept then
    update public.connection_requests
    set status = 'rejected', responded_at = now()
    where id = p_request_id;
    return;
  end if;

  update public.connection_requests
  set status = 'accepted', responded_at = now()
  where id = p_request_id;

  insert into public.connections (user_low_id, user_high_id, disconnected_at, created_from_request_id)
  values (
    least(v_request.sender_id, v_request.receiver_id),
    greatest(v_request.sender_id, v_request.receiver_id),
    null,
    v_request.id
  )
  on conflict (user_low_id, user_high_id)
  do update set disconnected_at = null, created_from_request_id = excluded.created_from_request_id
  returning id into v_connection_id;

  insert into public.conversations (connection_id)
  values (v_connection_id)
  on conflict (connection_id) do nothing;
end;
$$;

-- Harden the existing message RPC so it cannot be called with another sender ID.
create or replace function public.insert_message(
  p_conversation_id uuid,
  p_sender_id uuid,
  p_body text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender_id uuid := (select auth.uid());
  v_peer_id uuid;
  v_id uuid;
begin
  if v_sender_id is null or p_sender_id <> v_sender_id then
    raise exception 'authentication required';
  end if;
  if char_length(trim(p_body)) < 1 or char_length(trim(p_body)) > 5000 then
    raise exception 'message body must be between 1 and 5000 characters';
  end if;

  select case when c.user_low_id = v_sender_id then c.user_high_id else c.user_low_id end
  into v_peer_id
  from public.conversations as cv
  join public.connections as c on c.id = cv.connection_id
  where cv.id = p_conversation_id
    and c.disconnected_at is null
    and (c.user_low_id = v_sender_id or c.user_high_id = v_sender_id);

  if v_peer_id is null then
    raise exception 'active conversation not found';
  end if;
  if not exists (
    select 1 from public.subscriptions
    where user_id = v_sender_id
      and tier = 'premium'
      and starts_at <= now()
      and ends_at > now()
  ) then
    raise exception 'premium subscription required';
  end if;
  if exists (
    select 1 from public.blocks
    where (blocker_id = v_sender_id and blocked_id = v_peer_id)
       or (blocker_id = v_peer_id and blocked_id = v_sender_id)
  ) then
    raise exception 'messaging is blocked';
  end if;

  insert into public.messages (conversation_id, sender_id, body)
  values (p_conversation_id, v_sender_id, trim(p_body))
  returning id into v_id;
  return v_id;
end;
$$;

-- The order route may create only the signed-in member's correctly priced order.
create or replace function public.insert_payment(
  p_user_id uuid,
  p_provider text,
  p_provider_payment_id text,
  p_amount_inr integer,
  p_idempotency_key text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_role public.account_role;
begin
  if v_user_id is null or p_user_id <> v_user_id then
    raise exception 'authentication required';
  end if;
  select role into v_role from public.users where id = v_user_id;
  if p_provider <> 'razorpay'
    or p_amount_inr <> case when v_role = 'investor' then 310 else 240 end then
    raise exception 'invalid payment details';
  end if;

  insert into public.payments (user_id, provider, provider_payment_id, amount_inr, status, idempotency_key)
  values (v_user_id, p_provider, p_provider_payment_id, p_amount_inr, 'created', p_idempotency_key)
  on conflict (idempotency_key) do nothing;
end;
$$;

-- Called only by the verified webhook through a service-role client. It locks the
-- pending order, validates the charged amount and activates Premium once.
create or replace function public.complete_razorpay_payment(
  p_order_id text,
  p_payment_id text,
  p_amount_inr integer
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_subscription_id uuid;
begin
  select * into v_payment
  from public.payments
  where provider = 'razorpay'
    and idempotency_key is not null
    and (provider_payment_id = p_order_id or receipt_payload ->> 'order_id' = p_order_id)
  for update;

  if not found then
    raise exception 'pending payment not found';
  end if;
  if v_payment.amount_inr <> p_amount_inr then
    raise exception 'payment amount mismatch';
  end if;
  if v_payment.status = 'successful' then
    select id into v_subscription_id
    from public.subscriptions
    where user_id = v_payment.user_id and tier = 'premium' and ends_at > now()
    order by ends_at desc limit 1;
    return v_subscription_id;
  end if;

  update public.payments
  set status = 'successful',
      provider_payment_id = p_payment_id,
      paid_at = now(),
      receipt_payload = coalesce(receipt_payload, '{}'::jsonb) || jsonb_build_object('order_id', p_order_id)
  where id = v_payment.id;

  insert into public.subscriptions (user_id, tier, starts_at, ends_at)
  values (v_payment.user_id, 'premium', now(), now() + interval '30 days')
  returning id into v_subscription_id;

  return v_subscription_id;
end;
$$;

revoke execute on function public.record_profile_view(uuid) from public, anon;
revoke execute on function public.send_connection_request(uuid) from public, anon;
revoke execute on function public.respond_connection_request(uuid, boolean) from public, anon;
revoke execute on function public.insert_message(uuid, uuid, text) from public, anon;
revoke execute on function public.insert_payment(uuid, text, text, integer, text) from public, anon;
revoke execute on function public.complete_razorpay_payment(text, text, integer) from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.confirm_payment(text,text)') is not null then
    execute 'revoke execute on function public.confirm_payment(text, text) from public, anon, authenticated';
    execute 'grant execute on function public.confirm_payment(text, text) to service_role';
  end if;
  if to_regprocedure('public.activate_subscription(uuid,timestamp with time zone,timestamp with time zone)') is not null then
    execute 'revoke execute on function public.activate_subscription(uuid, timestamptz, timestamptz) from public, anon, authenticated';
    execute 'grant execute on function public.activate_subscription(uuid, timestamptz, timestamptz) to service_role';
  end if;
end;
$$;

grant execute on function public.record_profile_view(uuid) to authenticated;
grant execute on function public.send_connection_request(uuid) to authenticated;
grant execute on function public.respond_connection_request(uuid, boolean) to authenticated;
grant execute on function public.insert_message(uuid, uuid, text) to authenticated;
grant execute on function public.insert_payment(uuid, text, text, integer, text) to authenticated;
grant execute on function public.complete_razorpay_payment(text, text, integer) to service_role;
