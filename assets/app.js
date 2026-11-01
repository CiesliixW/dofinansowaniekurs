// Formularz freebie: walidacja, Turnstile, wysyłka do funkcji Supabase `zapis`.
(function () {
  const K = window.KONFIG;
  const form = document.getElementById("zapis");
  if (!form) return;
  const komunikat = document.getElementById("komunikat");
  const przycisk = form.querySelector("button[type=submit]");
  let widget = null;
  let token = "";

  const BLEDY = {
    imie: "Wpisz imię.",
    email: "Ten adres e-mail wygląda na niepełny.",
    regulamin: "Zaznacz akceptację regulaminu, żebym mógł wysłać PDF.",
    captcha: "Weryfikacja nie przeszła. Spróbuj jeszcze raz.",
    limit: "Za dużo prób z tego połączenia. Spróbuj za godzinę.",
    mail: "Zapisałem cię, ale mail nie wyszedł. Napisz na IG @wojtekcieslik_, wyślę ręcznie.",
    siec: "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.",
  };

  // Captcha tylko gdy jest klucz w config.js; skrypt Cloudflare ładujemy dopiero wtedy.
  const zCaptcha = Boolean(K.turnstileSiteKey);
  if (zCaptcha) {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=captchaGotowa";
    s.async = true;
    document.head.appendChild(s);
  }

  window.captchaGotowa = function () {
    widget = window.turnstile.render("#captcha", {
      sitekey: K.turnstileSiteKey,
      theme: "dark",
      language: "pl",
      callback: (t) => { token = t; },
      "expired-callback": () => { token = ""; },
      "error-callback": () => { token = ""; },
    });
  };

  function zrodlo() {
    const p = new URLSearchParams(location.search);
    const z = {};
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
      if (p.get(k)) z[k] = p.get(k).slice(0, 120);
    }
    if (document.referrer) z.referrer = document.referrer.slice(0, 300);
    return z;
  }

  function pokazBlad(kod, pole) {
    komunikat.textContent = BLEDY[kod] || "Coś poszło nie tak. Spróbuj ponownie za chwilę.";
    komunikat.className = "komunikat blad";
    if (pole) { pole.setAttribute("aria-invalid", "true"); pole.focus(); }
  }

  form.addEventListener("input", (e) => e.target.removeAttribute("aria-invalid"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    komunikat.textContent = "";
    komunikat.className = "komunikat";

    const imie = form.imie.value.trim();
    const email = form.email.value.trim();
    if (!imie) return pokazBlad("imie", form.imie);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return pokazBlad("email", form.email);
    if (!form.regulamin.checked) return pokazBlad("regulamin", form.regulamin);
    if (zCaptcha && !token) return pokazBlad("captcha");

    przycisk.disabled = true;
    przycisk.textContent = "Wysyłam…";
    try {
      const r = await fetch(`${K.supabaseUrl}/functions/v1/zapis`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: K.supabaseKey },
        body: JSON.stringify({
          imie,
          email,
          material: form.dataset.material,
          regulamin: true,
          marketing: form.marketing.checked,
          wersja_zgod: K.wersjaZgod,
          captcha: token,
          strona_www: form.strona_www.value,
          zrodlo: zrodlo(),
        }),
      });
      const wynik = await r.json().catch(() => ({}));
      if (!r.ok || !wynik.ok) throw new Error(wynik.blad || "inny");

      document.getElementById("po-email").textContent = email;
      document.getElementById("przed").hidden = true;
      const po = document.getElementById("po");
      po.hidden = false;
      po.focus();
    } catch (err) {
      pokazBlad(err instanceof TypeError ? "siec" : err.message);
      if (window.turnstile && widget !== null) window.turnstile.reset(widget);
      token = "";
    } finally {
      przycisk.disabled = false;
      przycisk.textContent = "Wyślij mi PDF";
    }
  });
})();
