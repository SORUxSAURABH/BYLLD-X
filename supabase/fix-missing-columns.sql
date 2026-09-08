-- ============================================================
-- BYLLD X — Run this quick patch in Supabase SQL Editor
-- This adds the missing columns and helper functions for
-- onboarding, discovery, network requests, and messaging.
-- ============================================================

-- 1. Add missing profile columns
alter table public.profiles
  add column if not exists phone text check (phone is null or char_length(phone) <= 32);

-- 2. Add missing founder_profiles columns
alter table public.founder_profiles
  add column if not exists startup_name text check (startup_name is null or char_length(startup_name) <= 160),
  add column if not exists industry text check (industry is null or char_length(industry) <= 120),
  add column if not exists startup_stage text check (startup_stage is null or startup_stage in ('idea', 'mvp', 'early_revenue', 'scaling')),
  add column if not exists startup_pitch text check (startup_pitch is null or char_length(startup_pitch) <= 420);

-- 3. Add missing investor_profiles columns
alter table public.investor_profiles
  add column if not exists firm_name text check (firm_name is null or char_length(firm_name) <= 160),
  add column if not exists sectors_of_interest text check (sectors_of_interest is null or char_length(sectors_of_interest) <= 1000),
  add column if not exists typical_check_size_inr bigint check (typical_check_size_inr is null or typical_check_size_inr >= 0);

-- 4. Enable RLS and grants for these columns
grant select, insert, update on public.founder_profiles to authenticated;
grant select, insert, update on public.investor_profiles to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.users to authenticated;

-- 4b. Allow initial role selection before onboarding completion
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

-- 4c. Auto-provision public.users and public.profiles on new auth signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_role public.account_role;
  v_name text;
begin
  v_role := coalesce(
    (new.raw_user_meta_data->>'role')::public.account_role,
    'founder'::public.account_role
  );
  v_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(coalesce(new.email, ''), '@', 1),
    'Member'
  );
  insert into public.users(id, email, role, full_name)
  values (new.id, new.email, v_role, v_name)
  on conflict(id) do update set
    email = excluded.email,
    full_name = coalesce(public.users.full_name, excluded.full_name);

  insert into public.profiles(user_id, full_name)
  values (new.id, v_name)
  on conflict(user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. Atomic profile view tracking RPC
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
    and coalesce(p.is_discoverable, true);

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

-- 6. Atomic connection request RPC
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
    and coalesce(p.is_discoverable, true);

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

-- 7. Respond to connection request RPC
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

-- 8. Grant execute permissions
grant execute on function public.record_profile_view(uuid) to authenticated;
grant execute on function public.send_connection_request(uuid) to authenticated;
grant execute on function public.respond_connection_request(uuid, boolean) to authenticated;
