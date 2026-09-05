-- Run this once in Supabase SQL Editor to enable profile photo uploads.
-- Go to: https://supabase.com/dashboard/project/ourpauaxcqdqvpjvzhxo/sql

-- 1. Create the avatars storage bucket (public so photos load without auth)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,  -- 2MB limit
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

-- 2. Allow authenticated users to upload only their own avatar
create policy "Users upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- 3. Allow authenticated users to update/delete their own avatar
create policy "Users update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- 4. Allow everyone to read avatars (they're public)
create policy "Public read avatars"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');
