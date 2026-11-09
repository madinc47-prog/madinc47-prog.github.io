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

-- =====================================================================
-- 1-to-1 ROOMS (shared by every collab feature in the suite — see /shared/COLLAB-POLICY.md)
-- Exactly two people: host (inviter) + guest (invitee). Invite must be accepted. No third party, no observers.
-- =====================================================================
create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  app         text not null default 'collab-room' check (app ~ '^[a-z0-9-]{2,32}$'),
  host        uuid not null references auth.users(id) on delete cascade default auth.uid(),
  guest       uuid not null references auth.users(id) on delete cascade,
  status      text not null default 'invited' check (status in ('invited','active','declined','ended')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (host <> guest)
);
create index if not exists rooms_guest on public.rooms (guest, status);
create index if not exists rooms_host on public.rooms (host, status);

create or replace function public.is_room_member(r uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rooms where id = r and auth.uid() in (host, guest));
$$;
create or replace function public.is_room_active_member(r uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rooms where id = r and status = 'active' and auth.uid() in (host, guest));
$$;

create or replace function public.rooms_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.host := auth.uid(); new.status := 'invited'; new.created_at := now();
    if (select count(*) from public.rooms where host = new.host and created_at > now() - interval '1 hour') >= 30
      then raise exception 'Too many invites — try again later'; end if;
  else
    -- members can never be changed => nobody can be swapped in or added
    if new.host <> old.host or new.guest <> old.guest or new.app <> old.app or new.id <> old.id then raise exception 'Room members are fixed'; end if;
    if old.status in ('ended','declined') then raise exception 'Room is closed'; end if;
    if new.status in ('active','declined') and old.status = 'invited' and auth.uid() <> old.guest then raise exception 'Only the invitee can accept or decline'; end if;
    if new.status = 'active' and old.status <> 'invited' and old.status <> 'active' then raise exception 'Bad state'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists rooms_guard on public.rooms;
create trigger rooms_guard before insert or update on public.rooms for each row execute function public.rooms_guard();

alter table public.rooms enable row level security;
drop policy if exists "room members read" on public.rooms;
create policy "room members read" on public.rooms for select using (auth.uid() in (host, guest));
drop policy if exists "invite as host" on public.rooms;
create policy "invite as host" on public.rooms for insert to authenticated with check (auth.uid() = host and guest <> auth.uid());
drop policy if exists "members update" on public.rooms;
create policy "members update" on public.rooms for update to authenticated using (auth.uid() in (host, guest)) with check (auth.uid() in (host, guest));

-- Signaling (WebRTC offer/answer/ICE, beat-sync, lyrics) — only the two members of an ACTIVE room.
create table if not exists public.room_signals (
  id          bigint generated always as identity primary key,
  room_id     uuid not null references public.rooms(id) on delete cascade,
  sender      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind        text not null check (kind in ('hello','offer','answer','ice','bye','sync','lyrics','chat','ctl')),
  payload     jsonb not null default '{}'::jsonb check (pg_column_size(payload) <= 16000),
  created_at  timestamptz not null default now()
);
create index if not exists room_signals_room on public.room_signals (room_id, id);
create or replace function public.room_signals_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.sender := auth.uid(); new.created_at := now();
  if (select count(*) from public.room_signals where sender = new.sender and created_at > now() - interval '1 minute') >= 600
    then raise exception 'Signal rate limit'; end if;
  return new;
end $$;
drop trigger if exists room_signals_guard on public.room_signals;
create trigger room_signals_guard before insert on public.room_signals for each row execute function public.room_signals_guard();
alter table public.room_signals enable row level security;
drop policy if exists "members read signals" on public.room_signals;
create policy "members read signals" on public.room_signals for select using (public.is_room_member(room_id));
drop policy if exists "active members send" on public.room_signals;
create policy "active members send" on public.room_signals for insert to authenticated with check (sender = auth.uid() and public.is_room_active_member(room_id));
-- old signals are useless; anyone in the room may clear them
drop policy if exists "members clear" on public.room_signals;
create policy "members clear" on public.room_signals for delete using (public.is_room_member(room_id));

do $$ begin alter publication supabase_realtime add table public.rooms; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.room_signals; exception when duplicate_object then null; end $$;
