// Publiczna konfiguracja strony. Klucz publishable jest jawny z założenia (dostęp do tabel blokuje RLS).
window.KONFIG = {
  supabaseUrl: "https://untuvgcvibefcdfoseat.supabase.co",
  supabaseKey: "sb_publishable_rZlkEnk0gadijrfes9Db3w_X56dxG9C",
  // Captcha Cloudflare Turnstile: pusty = wyłączona. Włączenie: klucz strony tutaj + sekret TURNSTILE_SECRET w Supabase.
  turnstileSiteKey: "",
  wersjaZgod: "v1",
};
