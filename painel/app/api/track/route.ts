/* ============================================================
   POST /api/track — ingestão de eventos
   Vai no app Next.js do painel.

   Regras:
   · O browser NUNCA escreve direto em `events`. Só aqui.
   · Nada que vem do cliente é confiado: device, OS, browser e região
     são derivados no servidor, do User-Agent e dos headers da Vercel.
   · O IP nunca é gravado — só a região aproximada.
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "edge";

const TIPOS = [
  "page_view",
  "course_view",
  "course_time",
  "course_search",
  "course_click",
  "form_opened",
  "whatsapp_click",
  "lead_created",
  "lead_reengaged",
] as const;

const Evento = z.object({
  type: z.enum(TIPOS),
  page: z.string().max(300).optional(),
  t: z.number().optional(),
  curso_slug: z.string().max(120).optional(),
  click_ref: z.string().regex(/^[A-Z2-9]{6}$/).optional(),
  termo: z.string().max(120).optional(),
  segundos: z.number().int().min(0).max(1800).optional(),
  titulo: z.string().max(200).optional(),
});

const Payload = z.object({
  visitor_id: z.string().uuid(),
  session_id: z.string().uuid(),
  tz: z.string().max(60).optional(),
  tela: z.string().max(20).optional(),
  ctx: z.object({
    utm_source: z.string().max(120).nullable().optional(),
    utm_medium: z.string().max(120).nullable().optional(),
    utm_campaign: z.string().max(160).nullable().optional(),
    utm_content: z.string().max(160).nullable().optional(),
    utm_term: z.string().max(160).nullable().optional(),
    origem: z.string().max(40).nullable().optional(),
    referrer: z.string().max(400).nullable().optional(),
  }),
  events: z.array(Evento).min(1).max(30),
});

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,        // só no servidor. Nunca no bundle.
  { auth: { persistSession: false } }
);

/* ---------- User-Agent → device / os / browser ----------
   Suficiente para os relatórios do painel. Se um dia precisar de mais
   precisão, troque por ua-parser-js — mas não antes de precisar.        */
function lerUA(ua: string) {
  const ios     = /iPhone|iPad|iPod/i.test(ua);
  const android = /Android/i.test(ua);
  const tablet  = /iPad/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));

  return {
    device: tablet ? "tablet" : ios || android ? "mobile" : "desktop",
    os: ios ? "iOS"
      : android ? "Android"
      : /Windows/i.test(ua) ? "Windows"
      : /Mac OS X/i.test(ua) ? "macOS"
      : /Linux/i.test(ua) ? "Linux"
      : "outro",
    browser:
        /CriOS/i.test(ua) ? "Chrome iOS"
      : /FBAN|FBAV/i.test(ua) ? "Facebook"           // in-app do Instagram/Facebook
      : /Instagram/i.test(ua) ? "Instagram"
      : /Edg\//i.test(ua) ? "Edge"
      : /Chrome\//i.test(ua) ? "Chrome"
      : /Firefox\//i.test(ua) ? "Firefox"
      : /Safari\//i.test(ua) ? "Safari"
      : "outro",
  };
}

/* Rate limit simples, em memória. Para volume alto, troque por Upstash. */
const janela = new Map<string, { n: number; ate: number }>();
function excedeu(chave: string, limite = 60, ms = 60_000) {
  const agora = Date.now();
  const r = janela.get(chave);
  if (!r || agora > r.ate) { janela.set(chave, { n: 1, ate: agora + ms }); return false; }
  r.n += 1;
  return r.n > limite;
}

export async function POST(req: NextRequest) {
  let corpo: unknown;
  try { corpo = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const parsed = Payload.safeParse(corpo);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const { visitor_id, session_id, ctx, events, tela, tz } = parsed.data;

  if (excedeu(visitor_id)) return NextResponse.json({ ok: true, ignorado: true });

  const ua     = req.headers.get("user-agent") ?? "";
  const info   = lerUA(ua);
  const regiao = [req.headers.get("x-vercel-ip-city"), req.headers.get("x-vercel-ip-country-region")]
    .filter(Boolean).join(" / ") || null;      // o IP em si nunca é gravado

  /* visitante ------------------------------------------------ */
  await sb.from("visitors").upsert(
    {
      id: visitor_id,
      last_seen_at: new Date().toISOString(),
      first_source: ctx.origem ?? null,
      first_utm_source: ctx.utm_source ?? null,
      first_utm_medium: ctx.utm_medium ?? null,
      first_utm_campaign: ctx.utm_campaign ?? null,
      first_referrer: ctx.referrer ?? null,
      ...info,
      regiao,
    },
    { onConflict: "id", ignoreDuplicates: false }
  );

  /* sessão --------------------------------------------------- */
  await sb.from("sessions").upsert(
    {
      id: session_id,
      visitor_id,
      last_seen_at: new Date().toISOString(),
      entry_page: events[0]?.page ?? null,
      exit_page: events[events.length - 1]?.page ?? null,
      referrer: ctx.referrer ?? null,
      utm_source: ctx.utm_source ?? null,
      utm_medium: ctx.utm_medium ?? null,
      utm_campaign: ctx.utm_campaign ?? null,
      utm_content: ctx.utm_content ?? null,
      utm_term: ctx.utm_term ?? null,
      ...info,
      regiao,
    },
    { onConflict: "id", ignoreDuplicates: false }
  );

  /* resolve os slugs de curso em uma única query — nada de N+1 */
  const slugs = [...new Set(events.map((e) => e.curso_slug).filter(Boolean))] as string[];
  const mapa = new Map<string, number>();
  if (slugs.length) {
    const { data } = await sb.from("courses").select("id, slug").in("slug", slugs);
    data?.forEach((c) => mapa.set(c.slug, c.id));
  }

  /* eventos -------------------------------------------------- */
  await sb.from("events").insert(
    events.map((e) => ({
      created_at: e.t ? new Date(e.t).toISOString() : new Date().toISOString(),
      visitor_id,
      session_id,
      course_id: e.curso_slug ? mapa.get(e.curso_slug) ?? null : null,
      type: e.type,
      page: e.page ?? null,
      meta: {
        termo: e.termo,
        segundos: e.segundos,
        titulo: e.titulo,
        click_ref: e.click_ref,
        tela,
        tz,
      },
    }))
  );

  /* clique no WhatsApp vira linha própria, com o código do atendimento */
  const cliques = events.filter((e) => e.type === "whatsapp_click" && e.click_ref);
  if (cliques.length) {
    await sb.from("whatsapp_clicks").upsert(
      cliques.map((e) => ({
        click_ref: e.click_ref!,
        visitor_id,
        session_id,
        course_id: e.curso_slug ? mapa.get(e.curso_slug) ?? null : null,
        origem: ctx.origem ?? null,
        utm_source: ctx.utm_source ?? null,
        utm_medium: ctx.utm_medium ?? null,
        utm_campaign: ctx.utm_campaign ?? null,
        page: e.page ?? null,
      })),
      { onConflict: "click_ref", ignoreDuplicates: true }
    );
  }

  return NextResponse.json({ ok: true });
}

/* CORS: o site público está em outro domínio. */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "https://SEU-SITE.vercel.app", // ← ajuste
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
