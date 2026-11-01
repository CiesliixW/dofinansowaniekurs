// Publiczna konfiguracja strony. Klucz publishable jest jawny z założenia (dostęp do tabel blokuje RLS).
window.KONFIG = {
  supabaseUrl: "https://untuvgcvibefcdfoseat.supabase.co",
  supabaseKey: "sb_publishable_rZlkEnk0gadijrfes9Db3w_X56dxG9C",
  // Testowy klucz Cloudflare Turnstile (zawsze przepuszcza). Podmień na swój z dash.cloudflare.com → Turnstile.
  turnstileSiteKey: "1x00000000000000000000AA",
  wersjaZgod: "v1",
};
