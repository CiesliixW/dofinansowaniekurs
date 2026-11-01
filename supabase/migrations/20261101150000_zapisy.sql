-- Freebie: materiały (PDF + treść maila), zapisy (imię, e-mail) i zgody.
-- Do tabel nie ma dostępu z przeglądarki (RLS bez polityk): pisze i czyta tylko funkcja `zapis` kluczem serwisowym
-- oraz Ty w panelu Supabase.

-- Materiał do pobrania: jeden wiersz na freebie. PDF leży w Storage (bucket `freebies`), tu tylko ścieżka.
create table public.materialy (
  slug             text primary key,
  tytul            text not null,
  plik_pdf         text,                      -- ścieżka w buckecie `freebies`, np. kasa-na-kurs.pdf; null = PDF jeszcze nie wgrany
  nazwa_zalacznika text not null default 'freebie.pdf',
  temat_maila      text not null,
  tresc_maila_html text not null,             -- zmienne: {{imie}}, {{link}}
  aktywny          boolean not null default true,
  zaktualizowano   timestamptz not null default now()
);

create table public.zapisy (
  id             uuid primary key default gen_random_uuid(),
  utworzono      timestamptz not null default now(),
  email          text not null check (email = lower(email) and length(email) <= 254),
  imie           text not null check (length(imie) between 1 and 60),
  material       text not null references public.materialy (slug),
  marketing      boolean not null default false,   -- aktualny stan zgody marketingowej (historia w `zgody`)
  ip             inet,
  user_agent     text,
  zrodlo         jsonb not null default '{}',      -- utm_*, referrer
  status_maila   text not null default 'oczekuje'
                 check (status_maila in ('oczekuje', 'wyslany', 'blad', 'czeka_na_pdf')),
  wyslano_mail   timestamptz,
  blad_maila     text,
  id_maila       text,                             -- id wiadomości w Resend
  unique (email, material)
);

create index zapisy_utworzono_idx on public.zapisy (utworzono desc);
create index zapisy_ip_idx on public.zapisy (ip, utworzono desc);

-- Każde zaznaczenie checkboxa zapisujemy z treścią, wersją i czasem (rozliczalność RODO).
create table public.zgody (
  id        bigint generated always as identity primary key,
  zapis_id  uuid not null references public.zapisy (id) on delete cascade,
  rodzaj    text not null check (rodzaj in ('regulamin', 'marketing')),
  udzielona boolean not null,
  tresc     text not null,
  wersja    text not null,
  ip        inet,
  utworzono timestamptz not null default now()
);

create index zgody_zapis_idx on public.zgody (zapis_id);

alter table public.materialy enable row level security;
alter table public.zapisy    enable row level security;
alter table public.zgody     enable row level security;

-- Prywatny bucket na PDF-y: link w mailu jest podpisany i wygasa.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('freebies', 'freebies', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;
