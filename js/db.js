/* GERADO POR sincronizar.mjs — NÃO EDITE ESTE ARQUIVO.
   Edite compartilhado/db.js e rode: node sincronizar.mjs */

/* ============================================================
   DB — camada fina em cima do Supabase.
   Se o Supabase não estiver configurado ou cair, o lead é
   guardado em localStorage e a pessoa NÃO é bloqueada.
   ============================================================ */
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_OK } from "./config.js";

let _client = null;

export async function getClient() {
  if (!SUPABASE_OK) return null;
  if (_client) return _client;
  try {
    const { createClient } = await import(
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm"
    );
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return _client;
  } catch (e) {
    console.warn("[db] Supabase indisponível:", e);
    return null;
  }
}

/* ---------- fila offline: nada de lead perdido ---------- */
const FILA = "alfa_leads_pendentes";

function enfileirar(lead) {
  try {
    const f = JSON.parse(localStorage.getItem(FILA) || "[]");
    f.push({ ...lead, _ts: Date.now() });
    localStorage.setItem(FILA, JSON.stringify(f.slice(-50)));
  } catch (_) {}
}

/** Reenvia leads que ficaram presos por falha de rede. */
export async function sincronizarPendentes() {
  const sb = await getClient();
  if (!sb) return;
  let fila;
  try { fila = JSON.parse(localStorage.getItem(FILA) || "[]"); } catch { return; }
  if (!fila.length) return;

  const restantes = [];
  for (const item of fila) {
    const { _ts, ...lead } = item;
    const { error } = await sb.from("leads").insert(lead);
    if (error && error.code !== "23505") restantes.push(item); // 23505 = duplicado, ok
  }
  localStorage.setItem(FILA, JSON.stringify(restantes));
}

/**
 * Grava o lead.
 * Retorna { ok, duplicado, offline } — nunca lança.
 */
export async function salvarLead(lead) {
  const sb = await getClient();
  if (!sb) { enfileirar(lead); return { ok: false, offline: true }; }

  const { error } = await sb.from("leads").insert(lead);

  if (!error) return { ok: true };
  if (error.code === "23505") return { ok: true, duplicado: true }; // já existe
  console.warn("[db] erro ao salvar lead:", error);
  enfileirar(lead);
  return { ok: false, offline: true, erro: error.message };
}

/* ---------- UTM / origem ---------- */
export function contexto() {
  const q = new URLSearchParams(location.search);
  return {
    utm_source:   q.get("utm_source")   || null,
    utm_medium:   q.get("utm_medium")   || null,
    utm_campaign: q.get("utm_campaign") || null,
    origem:       q.get("utm_source") ? "anuncio"
                : /instagram|ig/i.test(document.referrer) ? "instagram"
                : "site",
  };
}
