-- Production hardening: make payment fulfillment webhook-authoritative and
-- ensure the tables used by chat/presence are published to Realtime.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'presence'
  ) then
    alter publication supabase_realtime add table public.presence;
  end if;
end;
$$;

-- A signed-in member may create a ledger row only for their own correctly priced
-- Razorpay order. The webhook service role alone can complete it.
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
  if p_provider_payment_id is null or length(trim(p_provider_payment_id)) = 0
    or p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'invalid payment details';
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

-- Close legacy public function exposure for production deployments that started
-- from the older complete-setup SQL file.
revoke execute on function public.insert_payment(uuid, text, text, integer, text) from public, anon;
grant execute on function public.insert_payment(uuid, text, text, integer, text) to authenticated;

do $$
begin
  if to_regprocedure('public.confirm_payment(text,text)') is not null then
    execute 'revoke execute on function public.confirm_payment(text, text) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.activate_subscription(uuid,timestamp with time zone,timestamp with time zone)') is not null then
    execute 'revoke execute on function public.activate_subscription(uuid, timestamptz, timestamptz) from public, anon, authenticated';
  end if;
end;
$$;
