-- Island Pin Collab Map — Supabase setup. Paste ALL of this into Supabase → SQL Editor → Run. Safe to re-run.
-- Privacy: we store only a village NAME + that village's public centre point. Never GPS, never an address.

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null default '' check (char_length(display_name) <= 24),
  tagline       text not null default '' check (char_length(tagline) <= 40),
  role          text not null default 'artist' check (role in ('artist','producer','engineer','dj','singer','musician','videographer','other')),
  village       text check (village is null or char_length(village) <= 40),
  vlat          double precision check (vlat is null or vlat between 15.1 and 15.7),
  vlng          double precision check (vlng is null or vlng between -61.6 and -61.2),
  visible       boolean not null default false,
  whatsapp      text check (whatsapp is null or whatsapp ~ '^[0-9]{7,15}$'),
  show_whatsapp boolean not null default false,
  avatar_url    text check (avatar_url is null or char_length(avatar_url) <= 300),
  last_seen     timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- coarse coords rounded to 3 dp (~100 m) = village centre table value; never finer
create or replace function public.collab_profile_guard() returns trigger language plpgsql as $$
begin
  new.vlat := round(new.vlat::numeric, 3); new.vlng := round(new.vlng::numeric, 3);
  if new.visible and (new.village is null or new.vlat is null) then new.visible := false; end if;
  -- WhatsApp number is only ever stored while the user has opted in to showing it
  if not new.show_whatsapp then new.whatsapp := null; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists collab_profile_guard on public.profiles;
create trigger collab_profile_guard before insert or update on public.profiles for each row execute function public.collab_profile_guard();

alter table public.profiles enable row level security;
drop policy if exists "read visible or own" on public.profiles;
create policy "read visible or own" on public.profiles for select using (visible = true or auth.uid() = id);
drop policy if exists "insert own" on public.profiles;
create policy "insert own" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "update own" on public.profiles;
create policy "update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "delete own" on public.profiles;
create policy "delete own" on public.profiles for delete using (auth.uid() = id);

create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  sender      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  recipient   uuid not null references auth.users(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  check (sender <> recipient)
);
create index if not exists messages_pair on public.messages (sender, recipient, created_at desc);
create index if not exists messages_recipient on public.messages (recipient, created_at desc);

-- Rate limit: max 20 messages per minute and 300 per day per sender.
create or replace function public.collab_msg_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.sender := auth.uid(); new.created_at := now(); new.read_at := null;
  if (select count(*) from public.messages where sender = new.sender and created_at > now() - interval '1 minute') >= 20
    then raise exception 'Slow down — too many messages, try again in a minute'; end if;
  if (select count(*) from public.messages where sender = new.sender and created_at > now() - interval '1 day') >= 300
    then raise exception 'Daily message limit reached'; end if;
  return new;
end $$;
drop trigger if exists collab_msg_guard on public.messages;
create trigger collab_msg_guard before insert on public.messages for each row execute function public.collab_msg_guard();

alter table public.messages enable row level security;
drop policy if exists "read own threads" on public.messages;
create policy "read own threads" on public.messages for select using (auth.uid() = sender or auth.uid() = recipient);
drop policy if exists "send as self" on public.messages;
create policy "send as self" on public.messages for insert with check (auth.uid() = sender);
drop policy if exists "recipient marks read" on public.messages;
create policy "recipient marks read" on public.messages for update using (auth.uid() = recipient) with check (auth.uid() = recipient);
drop policy if exists "sender deletes own" on public.messages;
create policy "sender deletes own" on public.messages for delete using (auth.uid() = sender);

-- Realtime for DMs (RLS still applies to realtime)
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

-- Avatars: public-read bucket, 300 KB max, JPEG/WebP only, each user writes only avatars/<their-id>.*
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 307200, array['image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 307200, allowed_mime_types = array['image/jpeg','image/webp'];

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "avatars owner insert" on storage.objects;
create policy "avatars owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and split_part(name, '.', 1) = auth.uid()::text);
drop policy if exists "avatars owner update" on storage.objects;
create policy "avatars owner update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and split_part(name, '.', 1) = auth.uid()::text)
  with check (bucket_id = 'avatars' and split_part(name, '.', 1) = auth.uid()::text);
drop policy if exists "avatars owner delete" on storage.objects;
create policy "avatars owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and split_part(name, '.', 1) = auth.uid()::text);
