-- Forever3D wedding backend: RSVPs, guestbook wishes and per-wedding admin keys.
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- Guests never touch tables directly; everything goes through the functions below.

create extension if not exists pgcrypto with schema extensions;

create table public.weddings (
  id uuid primary key default gen_random_uuid(),
  admin_key_hash text not null,
  title text check (char_length(title) <= 200),
  created_at timestamptz not null default now()
);

create table public.rsvps (
  id bigint generated always as identity primary key,
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  invite text check (char_length(invite) <= 120),
  attending boolean not null,
  guests int not null default 1 check (guests between 0 and 50),
  events text[] not null default '{}',
  message text check (char_length(message) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- one reply per guest name + invite; resubmitting updates it
create unique index rsvps_one_per_guest on public.rsvps (wedding_id, lower(name), coalesce(invite, ''));

create table public.wishes (
  id bigint generated always as identity primary key,
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  message text not null check (char_length(message) between 1 and 500),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index wishes_by_wedding on public.wishes (wedding_id, created_at desc);

alter table public.weddings enable row level security;
alter table public.rsvps enable row level security;
alter table public.wishes enable row level security;
revoke all on public.weddings, public.rsvps, public.wishes from anon, authenticated;

-- internal: verifies the couple's admin key (stored only as a SHA-256 hash)
create function public.check_admin(p_wedding uuid, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.weddings
    where id = p_wedding and admin_key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
  ) then
    raise exception 'Invalid wedding or admin key' using errcode = '28000';
  end if;
end $$;
revoke execute on function public.check_admin(uuid, text) from public, anon, authenticated;

-- builder: register a wedding, returns its id and a secret admin key (shown once)
create function public.create_wedding(p_title text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  k text := encode(extensions.gen_random_bytes(24), 'hex');
  w uuid;
begin
  insert into public.weddings (admin_key_hash, title)
  values (encode(extensions.digest(k, 'sha256'), 'hex'), left(p_title, 200))
  returning id into w;
  return json_build_object('id', w, 'admin_key', k);
end $$;

-- guests: send or update an RSVP
create function public.submit_rsvp(
  p_wedding uuid, p_name text, p_invite text, p_attending boolean,
  p_guests int, p_events text[], p_message text
) returns json
language plpgsql security definer set search_path = '' as $$
declare r bigint;
begin
  if not exists (select 1 from public.weddings where id = p_wedding) then
    raise exception 'Unknown wedding';
  end if;
  insert into public.rsvps (wedding_id, name, invite, attending, guests, events, message)
  values (
    p_wedding, trim(p_name), nullif(trim(coalesce(p_invite, '')), ''), coalesce(p_attending, false),
    case when coalesce(p_attending, false) then greatest(1, least(coalesce(p_guests, 1), 50)) else 0 end,
    (select coalesce(array_agg(left(e, 100)), '{}') from unnest((coalesce(p_events, '{}'))[1:20]) e),
    nullif(left(trim(coalesce(p_message, '')), 1000), '')
  )
  on conflict (wedding_id, lower(name), coalesce(invite, '')) do update
    set attending = excluded.attending, guests = excluded.guests, events = excluded.events,
        message = excluded.message, updated_at = now()
  returning id into r;
  return json_build_object('id', r);
end $$;

-- guests: post a wish (max 20 per minute per wedding)
create function public.add_wish(p_wedding uuid, p_name text, p_message text) returns json
language plpgsql security definer set search_path = '' as $$
declare r public.wishes;
begin
  if not exists (select 1 from public.weddings where id = p_wedding) then
    raise exception 'Unknown wedding';
  end if;
  if (select count(*) from public.wishes where wedding_id = p_wedding and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Too many wishes right now — please try again in a minute';
  end if;
  insert into public.wishes (wedding_id, name, message)
  values (p_wedding, left(trim(p_name), 80), left(trim(p_message), 500))
  returning * into r;
  return json_build_object('id', r.id, 'name', r.name, 'message', r.message, 'created_at', r.created_at);
end $$;

-- guests: read visible wishes
create function public.list_wishes(p_wedding uuid)
returns table (id bigint, name text, message text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select w.id, w.name, w.message, w.created_at from public.wishes w
  where w.wedding_id = p_wedding and not w.hidden
  order by w.created_at desc limit 300;
$$;

-- couple: everything, with the admin key
create function public.admin_data(p_wedding uuid, p_key text) returns json
language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_admin(p_wedding, p_key);
  return json_build_object(
    'rsvps', coalesce((select json_agg(r order by r.updated_at desc) from public.rsvps r where r.wedding_id = p_wedding), '[]'::json),
    'wishes', coalesce((select json_agg(w order by w.created_at desc) from public.wishes w where w.wedding_id = p_wedding), '[]'::json)
  );
end $$;

create function public.admin_set_wish_hidden(p_wedding uuid, p_key text, p_id bigint, p_hidden boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_admin(p_wedding, p_key);
  update public.wishes set hidden = p_hidden where id = p_id and wedding_id = p_wedding;
end $$;

create function public.admin_delete_rsvp(p_wedding uuid, p_key text, p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_admin(p_wedding, p_key);
  delete from public.rsvps where id = p_id and wedding_id = p_wedding;
end $$;

revoke execute on function public.create_wedding(text), public.submit_rsvp(uuid, text, text, boolean, int, text[], text),
  public.add_wish(uuid, text, text), public.list_wishes(uuid), public.admin_data(uuid, text),
  public.admin_set_wish_hidden(uuid, text, bigint, boolean), public.admin_delete_rsvp(uuid, text, bigint) from public;
grant execute on function public.create_wedding(text), public.submit_rsvp(uuid, text, text, boolean, int, text[], text),
  public.add_wish(uuid, text, text), public.list_wishes(uuid), public.admin_data(uuid, text),
  public.admin_set_wish_hidden(uuid, text, bigint, boolean), public.admin_delete_rsvp(uuid, text, bigint) to anon, authenticated;
