# dofinansowaniekurs – landingi marki Horyzont

Statyczne strony na GitHub Pages + Supabase (baza, plik PDF, funkcja wysyłająca maila).

- `index.html` – freebie „Jak ogarnąć kasę z Unii na wymarzony kurs”: imię, e-mail, zgody, captcha → mail z PDF-em.
- `regulamin.html`, `prywatnosc.html` – uzupełnij pola oznaczone `[…]` (dane firmy, e-mail kontaktowy).
- `assets/config.js` – adres Supabase, klucz publishable, klucz strony Turnstile.
- `email/kasa-na-kurs.html` – oryginał maila. Produkcyjna treść żyje w Supabase (`materialy.tresc_maila_html`).
- `supabase/` – migracje i funkcja `zapis`.

## Jak to działa

1. Formularz → `POST /functions/v1/zapis` (Supabase Edge Function).
2. Funkcja sprawdza captchę (Cloudflare Turnstile), limit 5 zapisów/h z jednego IP i pułapkę na boty.
3. Zapisuje osobę w `zapisy` i każdą zgodę (z treścią i wersją) w `zgody`.
4. Pobiera PDF z prywatnego bucketu `freebies`, wysyła maila z Gmaila (SMTP, hasło do aplikacji, limit ok. 500 maili dziennie): PDF w załączniku + link ważny 30 dni.
5. Status wysyłki widać w `zapisy.status_maila` (`wyslany`, `blad`, `czeka_na_pdf`).

Tabele mają włączone RLS bez polityk: z przeglądarki nikt ich nie przeczyta, pisze tylko funkcja.

## Wgranie PDF-a

1. Supabase → Storage → `freebies` → wgraj plik, np. `kasa-na-kurs.pdf`.
2. Table Editor → `materialy` → wiersz `kasa-na-kurs` → `plik_pdf` = `kasa-na-kurs.pdf`.

## Wdrożenie Supabase

```bash
npx supabase login
npx supabase link --project-ref untuvgcvibefcdfoseat
npx supabase db push
npx supabase secrets set GMAIL_USER=adres@gmail.com GMAIL_APP_PASSWORD=... \
  ALLOWED_ORIGINS=https://ciesliixw.github.io,http://localhost:4321
npx supabase functions deploy zapis --no-verify-jwt --use-api
```

## Zmiana treści zgód

Tekst checkboxów w `index.html` musi być taki sam jak `ZGODY` w `supabase/functions/zapis/index.ts`.
Zmieniasz – dodaj nową wersję (`v2`) w funkcji i ustaw `wersjaZgod` w `assets/config.js`.

## Gmail

Hasło do aplikacji: myaccount.google.com/apppasswords (konto musi mieć weryfikację dwuetapową).
Mail wychodzi z adresu `GMAIL_USER`; nazwę nadawcy zmienia sekret `MAIL_FROM_NAME`.

## Captcha (obecnie wyłączona)

Chronią pułapka na boty i limit 5 zapisów/h z IP. Włączenie Cloudflare Turnstile: klucz strony w `assets/config.js`
(`turnstileSiteKey`), sekret w Supabase (`TURNSTILE_SECRET`), i wróć Cloudflare do polityki prywatności.

## Strona `/program/`

Link z ostatniej strony PDF-a: https://ciesliixw.github.io/dofinansowaniekurs/program/?utm_source=pdf
Na razie kontakt (mail, IG); docelowo zgłoszenie do płatnego programu.
