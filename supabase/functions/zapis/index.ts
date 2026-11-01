// Zapis z landingu: sprawdza captchę (Cloudflare Turnstile), zapisuje imię, e-mail i zgody,
// wysyła maila z PDF-em w załączniku i podpisanym linkiem (Gmail SMTP, hasło do aplikacji).
//
// Sekrety (supabase secrets set ...): TURNSTILE_SECRET, GMAIL_USER, GMAIL_APP_PASSWORD, ALLOWED_ORIGINS,
// opcjonalnie MAIL_FROM_NAME (domyślnie „Wojciech”) i MAIL_REPLY_TO.
// SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY Supabase wstrzykuje sam.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { Buffer } from "node:buffer";
import nodemailer from "npm:nodemailer@6.9.16";

// Treści zgód muszą się zgadzać z checkboxami na stronie. Zmieniasz tekst – podbij wersję tu i w index.html.
const ZGODY: Record<string, { regulamin: string; marketing: string }> = {
  v1: {
    regulamin:
      "Akceptuję Regulamin i Politykę prywatności. Chcę dostać PDF na podany adres e-mail.",
    marketing:
      "Chcę dostawać od Wojciecha maile z materiałami i ofertami jego programów. Zgodę mogę wycofać w każdej chwili.",
  },
};

const LINK_WAZNY_S = 60 * 60 * 24 * 30;
const LIMIT_IP_NA_GODZINE = 5;
const PONOWNA_WYSYLKA_PO_MIN = 10;

// Supabase blokuje wychodzące porty 25 i 587, więc Gmail przez 465 (TLS od początku połączenia).
const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const poczta = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user: GMAIL_USER, pass: (Deno.env.get("GMAIL_APP_PASSWORD") ?? "").replace(/\s/g, "") },
});

const dozwolone = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

function cors(origin: string | null): HeadersInit {
  const ok = origin && (dozwolone.length === 0 || dozwolone.includes(origin));
  return {
    "Access-Control-Allow-Origin": ok ? origin : dozwolone[0] ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Vary": "Origin",
  };
}

function odpowiedz(origin: string | null, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

async function sprawdzCaptche(token: string, ip: string | null) {
  const form = new FormData();
  form.append("secret", Deno.env.get("TURNSTILE_SECRET") ?? "");
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const wynik = await r.json();
  return wynik.success === true;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return odpowiedz(origin, 405, { blad: "metoda" });
  if (dozwolone.length && origin && !dozwolone.includes(origin)) {
    return odpowiedz(origin, 403, { blad: "origin" });
  }

  let dane: Record<string, unknown>;
  try {
    dane = await req.json();
  } catch {
    return odpowiedz(origin, 400, { blad: "json" });
  }

  // Pułapka na boty: pole niewidoczne dla ludzi. Udajemy sukces.
  if (typeof dane.strona_www === "string" && dane.strona_www.trim() !== "") {
    return odpowiedz(origin, 200, { ok: true });
  }

  const imie = String(dane.imie ?? "").trim().replace(/\s+/g, " ");
  const email = String(dane.email ?? "").trim().toLowerCase();
  const material = String(dane.material ?? "");
  const wersja = String(dane.wersja_zgod ?? "");
  const marketing = dane.marketing === true;
  const token = String(dane.captcha ?? "");

  if (imie.length < 1 || imie.length > 60) return odpowiedz(origin, 400, { blad: "imie" });
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return odpowiedz(origin, 400, { blad: "email" });
  }
  if (dane.regulamin !== true) return odpowiedz(origin, 400, { blad: "regulamin" });
  const zgody = ZGODY[wersja];
  if (!zgody) return odpowiedz(origin, 400, { blad: "wersja_zgod" });
  if (!token) return odpowiedz(origin, 400, { blad: "captcha" });

  const ip = req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;

  if (!(await sprawdzCaptche(token, ip))) return odpowiedz(origin, 400, { blad: "captcha" });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: mat } = await db.from("materialy")
    .select("slug, plik_pdf, nazwa_zalacznika, temat_maila, tresc_maila_html")
    .eq("slug", material).eq("aktywny", true).maybeSingle();
  if (!mat) return odpowiedz(origin, 404, { blad: "material" });

  if (ip) {
    const godzineTemu = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db.from("zapisy").select("id", { count: "exact", head: true })
      .eq("ip", ip).gte("utworzono", godzineTemu);
    if ((count ?? 0) >= LIMIT_IP_NA_GODZINE) return odpowiedz(origin, 429, { blad: "limit" });
  }

  const zrodlo = typeof dane.zrodlo === "object" && dane.zrodlo !== null ? dane.zrodlo : {};
  const { data: poprzedni } = await db.from("zapisy")
    .select("id, wyslano_mail").eq("email", email).eq("material", material).maybeSingle();

  const { data: zapis, error: bladZapisu } = await db.from("zapisy").upsert({
    email,
    imie,
    material,
    // Brak zaznaczenia przy ponownym zapisie to nie wycofanie zgody: nadpisujemy tylko na „tak”.
    ...(marketing ? { marketing: true } : {}),
    ip,
    user_agent: req.headers.get("user-agent")?.slice(0, 400) ?? null,
    zrodlo,
  }, { onConflict: "email,material" }).select("id").single();
  if (bladZapisu || !zapis) {
    console.error("zapis", bladZapisu);
    return odpowiedz(origin, 500, { blad: "baza" });
  }

  await db.from("zgody").insert([
    { zapis_id: zapis.id, rodzaj: "regulamin", udzielona: true, tresc: zgody.regulamin, wersja, ip },
    { zapis_id: zapis.id, rodzaj: "marketing", udzielona: marketing, tresc: zgody.marketing, wersja, ip },
  ]);

  // Ktoś klika drugi raz po chwili: nie zasypujemy skrzynki.
  if (
    poprzedni?.wyslano_mail &&
    Date.now() - new Date(poprzedni.wyslano_mail).getTime() < PONOWNA_WYSYLKA_PO_MIN * 60_000
  ) {
    return odpowiedz(origin, 200, { ok: true });
  }

  if (!mat.plik_pdf) {
    await db.from("zapisy").update({ status_maila: "czeka_na_pdf" }).eq("id", zapis.id);
    return odpowiedz(origin, 200, { ok: true });
  }

  try {
    const { data: pdf, error: bladPdf } = await db.storage.from("freebies").download(mat.plik_pdf);
    if (bladPdf || !pdf) throw new Error(`pdf: ${bladPdf?.message}`);
    const { data: link, error: bladLinku } = await db.storage.from("freebies")
      .createSignedUrl(mat.plik_pdf, LINK_WAZNY_S, { download: mat.nazwa_zalacznika });
    if (bladLinku || !link) throw new Error(`link: ${bladLinku?.message}`);

    const html = mat.tresc_maila_html
      .replaceAll("{{imie}}", escapeHtml(imie))
      .replaceAll("{{link}}", escapeHtml(link.signedUrl));

    const wynik = await poczta.sendMail({
      from: { name: Deno.env.get("MAIL_FROM_NAME") || "Wojciech", address: GMAIL_USER },
      to: email,
      replyTo: Deno.env.get("MAIL_REPLY_TO") || undefined,
      subject: mat.temat_maila,
      html,
      attachments: [{
        filename: mat.nazwa_zalacznika,
        content: Buffer.from(await pdf.arrayBuffer()),
        contentType: "application/pdf",
      }],
    });

    await db.from("zapisy").update({
      status_maila: "wyslany",
      wyslano_mail: new Date().toISOString(),
      id_maila: wynik.messageId,
      blad_maila: null,
    }).eq("id", zapis.id);
    return odpowiedz(origin, 200, { ok: true });
  } catch (e) {
    console.error("mail", e);
    await db.from("zapisy").update({ status_maila: "blad", blad_maila: String(e).slice(0, 1000) })
      .eq("id", zapis.id);
    return odpowiedz(origin, 502, { blad: "mail" });
  }
});
