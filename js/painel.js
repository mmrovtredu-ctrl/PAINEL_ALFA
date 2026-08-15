/* ============================================================
   PAINEL INSTITUTO ALFA
   Leads (CRM) · Matrículas · Financeiro
   Segurança: RLS no Supabase. Sem login, nada é lido.
   ============================================================ */
import { getClient } from "./db.js";
import { SUPABASE_OK } from "./config.js";
import { CURSOS, AREAS } from "./cursos.js";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, m =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const BRL = (n) => (+n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (d) => d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
const dataHoraBR = (d) => d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const hoje = () => new Date().toISOString().slice(0, 10);

let sb = null;
let LEADS = [], MATRICULAS = [], LANCAMENTOS = [];

function toast(msg, tipo = "ok") {
  const t = $("#toast");
  t.className = "toast " + tipo;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._t);
  t._t = setTimeout(() => (t.hidden = true), 3200);
}

/* ============================================================
   LOGIN
   ============================================================ */
async function iniciar() {
  if (!SUPABASE_OK) { $("#cfgAviso").hidden = false; return; }
  sb = await getClient();
  if (!sb) { $("#cfgAviso").hidden = false; return; }

  const { data } = await sb.auth.getSession();
  if (data.session) entrar(data.session);

  sb.auth.onAuthStateChange((_e, session) => {
    if (!session) { $("#app").hidden = true; $("#telaLogin").hidden = false; }
  });
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $(".btn", e.target); const err = $("#loginErro");
  err.hidden = true; btn.disabled = true; btn.textContent = "Entrando…";

  const { data, error } = await sb.auth.signInWithPassword({
    email: $("#l-email").value.trim(),
    password: $("#l-senha").value,
  });

  btn.disabled = false; btn.textContent = "Entrar";
  if (error) {
    err.textContent = error.message.includes("Invalid")
      ? "E-mail ou senha incorretos." : error.message;
    err.hidden = false;
    return;
  }
  entrar(data.session);
});

function entrar(session) {
  $("#telaLogin").hidden = true;
  $("#app").hidden = false;
  $("#userEmail").textContent = session.user.email;
  carregarTudo();
}

$("#btnSair").addEventListener("click", async () => {
  await sb.auth.signOut();
  location.reload();
});

/* ============================================================
   ABAS
   ============================================================ */
let abaAtual = "dash";

function irPara(tab) {
  abaAtual = tab;
  $$(".aba").forEach(a => a.classList.toggle("active", a.dataset.tab === tab));
  $$(".tab").forEach(t => (t.hidden = t.id !== "tab-" + tab));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("#abas").addEventListener("click", (e) => {
  const b = e.target.closest(".aba");
  if (b) irPara(b.dataset.tab);
});

/* atalhos do painel: os cartões da visão geral levam para a tela certa */
document.addEventListener("click", (e) => {
  const ir = e.target.closest("[data-ir]");
  if (ir) irPara(ir.dataset.ir);
});

/* botão + : o que ele cria depende de onde você está */
$("#fabAdd").addEventListener("click", () => {
  if (abaAtual === "financeiro") return formLancamento();
  formMatricula(null);
});

/* ============================================================
   CARGA DE DADOS
   ============================================================ */
async function carregarTudo() {
  const [l, m, f] = await Promise.all([
    sb.from("leads").select("*").order("created_at", { ascending: false }).limit(2000),
    sb.from("matriculas").select("*").order("created_at", { ascending: false }).limit(2000),
    sb.from("v_financeiro").select("*").order("vencimento", { ascending: true }).limit(5000),
  ]);
  if (l.error || m.error || f.error) {
    toast("Erro ao carregar: " + (l.error || m.error || f.error).message, "bad");
    return;
  }
  LEADS = l.data || []; MATRICULAS = m.data || []; LANCAMENTOS = f.data || [];
  renderDash(); renderLeads(); renderMatriculas(); renderFinanceiro();
}

/* ============================================================
   PEÇAS DA INTERFACE
   Tudo desenhado a partir dos dados reais. Nada de número fixo.
   ============================================================ */

/** Série de contagens por dia. `n` dias até hoje. */
function serieDias(itens, campoData, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(Date.now() - i * 864e5);
    const chave = dt.toISOString().slice(0, 10);
    out.push({
      chave,
      label: dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      n: itens.filter(x => String(x[campoData] || "").slice(0, 10) === chave).length,
    });
  }
  return out;
}

/** Variação percentual entre a primeira e a segunda metade da série. */
function variacao(serie) {
  const meio = Math.floor(serie.length / 2);
  const a = serie.slice(0, meio).reduce((s, d) => s + d.n, 0);
  const b = serie.slice(meio).reduce((s, d) => s + d.n, 0);
  if (!a) return b ? 100 : 0;
  return ((b - a) / a) * 100;
}

/** Linha suave em SVG. Escala sozinha na largura — nunca estoura a tela. */
function sparkline(vals, id = "sl") {
  const max = Math.max(1, ...vals);
  const n = Math.max(vals.length, 2);
  const pts = vals.map((v, i) => [
    (i / (n - 1)) * 100,
    30 - (v / max) * 26,
  ]);
  const linha = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `0,32 ${linha} 100,32`;
  return `<svg class="spark-svg" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="${area}" fill="rgba(255,255,255,.16)"></polygon>
      <polyline points="${linha}" fill="none" stroke="currentColor" stroke-width="1.6"
                stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"></polyline>
      ${pts.map(([x, y]) => `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.5" fill="currentColor"/>`).join("")}
    </svg>`;
}

/** Barras com rótulo de dia. */
function barras(serie) {
  const max = Math.max(1, ...serie.map(d => d.n));
  return `<div class="barras">${serie.map(d => `
    <div class="barra-col" title="${d.label}: ${d.n}">
      <div class="barra-tubo"><i style="height:${Math.max(4, d.n / max * 100)}%"></i></div>
      <span>${d.label}</span>
    </div>`).join("")}</div>`;
}

/** Cartão grande do topo de cada tela. */
function hero(cls, valor, rotulo, delta, grafico) {
  const sinal = delta >= 0 ? "↑" : "↓";
  return `<div class="hero ${cls}">
    <div class="hero-top">
      <div>
        <div class="hero-v">${valor}</div>
        <div class="hero-r">${rotulo}</div>
      </div>
      <div class="hero-delta ${delta >= 0 ? "up" : "down"}">
        <b>${sinal} ${Math.abs(delta).toFixed(1).replace(".", ",")}%</b>
        <span>vs. período anterior</span>
      </div>
    </div>
    <div class="hero-graf">${grafico}</div>
  </div>`;
}

/** Quadradinho de métrica. */
const tile = (ico, valor, rotulo, cor = "") =>
  `<div class="tile ${cor}">
     <span class="tile-ico" aria-hidden="true">${ico}</span>
     <div class="tile-v">${valor}</div>
     <div class="tile-r">${rotulo}</div>
   </div>`;

/* ícones curtos, em traço, herdando a cor */
const IC = {
  pessoas: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9.2" cy="8" r="3.4"/><path d="M2.8 20.2a6.4 6.4 0 0 1 12.8 0"/><path d="M16.8 5.2a3.2 3.2 0 0 1 0 6"/><path d="M18.2 20.2a5.4 5.4 0 0 0-2.6-4.6"/></svg>`,
  novo:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="8" r="3.4"/><path d="M3.6 20.2a6.4 6.4 0 0 1 12.8 0"/><path d="M18.4 7v6M21.4 10h-6"/></svg>`,
  fone:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.4 16.9v2.6a1.8 1.8 0 0 1-1.9 1.8 17.6 17.6 0 0 1-7.7-2.7 17.3 17.3 0 0 1-5.3-5.3A17.6 17.6 0 0 1 2.8 5.5 1.8 1.8 0 0 1 4.6 3.6h2.6a1.8 1.8 0 0 1 1.8 1.6c.1.9.3 1.7.7 2.5a1.8 1.8 0 0 1-.4 1.9l-1.1 1.1a14.4 14.4 0 0 0 5.3 5.3l1.1-1.1a1.8 1.8 0 0 1 1.9-.4c.8.3 1.6.6 2.5.7a1.8 1.8 0 0 1 1.4 1.8Z"/></svg>`,
  ok:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.8"/><path d="m8.2 12.3 2.6 2.6 5-5.4"/></svg>`,
  capelo:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.4 3.4 8.6 12 12.8l8.6-4.2L12 4.4Z"/><path d="M6.8 10.4v3.8c0 1.4 2.3 2.6 5.2 2.6s5.2-1.2 5.2-2.6v-3.8"/></svg>`,
  dinheiro:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.8"/><path d="M12 7v10M14.6 9.4c-.5-.7-1.5-1.1-2.6-1.1-1.6 0-2.6.8-2.6 1.9 0 2.7 5.2 1.4 5.2 4.1 0 1.1-1 1.9-2.6 1.9-1.1 0-2.1-.4-2.6-1.1"/></svg>`,
  grafico: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.4 20h17.2"/><path d="m4.6 15.4 4.4-4.6 3.4 3 5.6-6"/><path d="M18 7.6h2.2v2.2"/></svg>`,
  perdido: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.8"/><path d="m9.4 9.4 5.2 5.2M14.6 9.4l-5.2 5.2"/></svg>`,
  alerta:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.6 21.4 20H2.6L12 3.6Z"/><path d="M12 9.6v4.2M12 17h.01"/></svg>`,
  seta:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6.5 18.5 12 13 17.5"/></svg>`,
};

/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDash() {
  const d30 = Date.now() - 30 * 864e5;
  const d7  = Date.now() - 7 * 864e5;
  const novos30 = LEADS.filter(l => new Date(l.created_at) >= d30).length;
  const novos7  = LEADS.filter(l => new Date(l.created_at) >= d7).length;
  const matric  = LEADS.filter(l => l.status === "matriculado").length;
  const conv    = LEADS.length ? (matric / LEADS.length * 100) : 0;
  const ativas  = MATRICULAS.filter(m => m.status === "ativa").length;

  const recebido = LANCAMENTOS.filter(x => x.tipo === "entrada" && x.status === "pago")
    .reduce((s, x) => s + +x.valor, 0);
  const aReceber = LANCAMENTOS.filter(x => x.tipo === "entrada" && x.status_efetivo === "pendente")
    .reduce((s, x) => s + +x.valor, 0);
  const atrasado = LANCAMENTOS.filter(x => x.status_efetivo === "atrasado" && x.tipo === "entrada")
    .reduce((s, x) => s + +x.valor, 0);

  const serie14 = serieDias(LEADS, "created_at", 14);

  /* ---- cartão "Visão geral": 4 números + gráfico ---- */
  $("#kpis").innerHTML = `
    <div class="cartao">
      <div class="cartao-head">
        <h3>Últimos 14 dias</h3>
        <span class="chip-min">${serie14.reduce((s, d) => s + d.n, 0)} leads</span>
      </div>
      <div class="grade-4">
        ${tile(IC.pessoas,  LEADS.length,      "Leads no total",   "roxo")}
        ${tile(IC.capelo,   ativas,            "Matrículas ativas","azul")}
        ${tile(IC.dinheiro, BRL(recebido),     "Recebido",         "verde")}
        ${tile(IC.grafico,  conv.toFixed(1).replace(".", ",") + "%", "Conversão", "dourado")}
      </div>
      <div class="graf-linha">${sparkline(serie14.map(d => d.n))}</div>
      <div class="graf-eixo">
        <span>${serie14[0].label}</span><span>${serie14[Math.floor(serie14.length / 2)].label}</span><span>${serie14[serie14.length - 1].label}</span>
      </div>
    </div>`;

  /* ---- três atalhos para as outras telas ---- */
  const atalho = (id, cor, ico, titulo, sub, itens) => `
    <button class="atalho ${cor}" data-ir="${id}">
      <div class="at-top">
        <span class="at-ico" aria-hidden="true">${ico}</span>
        <div class="at-txt"><b>${titulo}</b><small>${sub}</small></div>
        <span class="at-seta" aria-hidden="true">${IC.seta}</span>
      </div>
      <div class="at-nums">
        ${itens.map(([v, r]) => `<div><b>${v}</b><small>${r}</small></div>`).join("")}
      </div>
    </button>`;

  $("#atalhos").innerHTML = `
    <div class="atalhos">
      ${atalho("leads", "roxo", IC.pessoas, "Leads", "Gerencie e acompanhe", [
        [LEADS.length, "Total"], [novos7, "Novos (7 dias)"],
        [conv.toFixed(1).replace(".", ",") + "%", "Conversão"]])}
      ${atalho("matriculas", "azul", IC.capelo, "Matrículas", "Alunos em curso", [
        [MATRICULAS.length, "Total"], [ativas, "Ativas"],
        [BRL(MATRICULAS.length ? MATRICULAS.reduce((s, m) => s + +m.valor_mensalidade, 0) / MATRICULAS.length : 0), "Ticket médio"]])}
      ${atalho("financeiro", "verde", IC.dinheiro, "Financeiro", "Resumo do período", [
        [BRL(recebido), "Recebido"], [BRL(aReceber), "A receber"], [BRL(atrasado), "Em atraso"]])}
    </div>`;

  /* ---- ranking de cursos, por course_slug quando existir ---- */
  const cont = {};
  LEADS.forEach(l => {
    const chave = l.curso || "—";
    cont[chave] = (cont[chave] || 0) + 1;
  });
  const top = Object.entries(cont).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxC = top.length ? top[0][1] : 1;
  $("#rankCursos").innerHTML = top.length
    ? top.map(([nome, n], i) => `<div class="rank-item">
        <span class="rank-pos">${i + 1}</span>
        <div class="rank-corpo">
          <div class="rank-linha"><b>${esc(nome)}</b><span>${n} lead${n === 1 ? "" : "s"}</span></div>
          <div class="rank-bar"><i style="width:${n / maxC * 100}%"></i></div>
        </div>
      </div>`).join("")
    : `<p class="vaziomsg">Sem leads ainda.</p>`;

  /* ---- contas a vencer ---- */
  const lim = new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10);
  const prox = LANCAMENTOS.filter(x => x.status === "pendente" && x.vencimento <= lim)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento)).slice(0, 8);
  $("#proxVencimentos").innerHTML = prox.length
    ? `<div class="lista">${prox.map(x => cartaoLancamento(x, true)).join("")}</div>`
    : `<p class="vaziomsg">Nada vencendo nos próximos 15 dias.</p>`;
}

/* ============================================================
   LEADS
   ============================================================ */
function leadsFiltrados() {
  const q = $("#buscaLead").value.trim().toLowerCase();
  const st = $("#filtroStatus").value;
  const per = +$("#filtroPeriodo").value;
  const corte = per ? Date.now() - per * 864e5 : 0;

  return LEADS.filter(l => {
    if (st && l.status !== st) return false;
    if (corte && new Date(l.created_at) < corte) return false;
    if (!q) return true;
    return [l.nome, l.email, l.telefone, l.curso, l.cidade]
      .some(v => String(v || "").toLowerCase().includes(q));
  });
}

function renderLeads() {
  const list = leadsFiltrados();

  /* ---- cartão do topo ---- */
  const serie = serieDias(LEADS, "created_at", 14);
  $("#heroLeads").innerHTML = hero(
    "h-roxo", LEADS.length.toLocaleString("pt-BR"), "Leads no total",
    variacao(serie), sparkline(serie.map(d => d.n)));

  /* ---- quatro números ---- */
  const cont = (st) => LEADS.filter(l => l.status === st).length;
  const novos7 = LEADS.filter(l => new Date(l.created_at) >= Date.now() - 7 * 864e5).length;
  $("#tilesLeads").innerHTML = `<div class="grade-4">
    ${tile(IC.novo,    novos7,               "Novos (7 dias)", "roxo")}
    ${tile(IC.fone,    cont("contatado"),    "Em contato",     "dourado")}
    ${tile(IC.ok,      cont("negociacao"),   "Negociação",     "azul")}
    ${tile(IC.capelo,  cont("matriculado"),  "Matriculados",   "verde")}
  </div>`;

  /* ---- funil: só etapas reais do banco ---- */
  const etapas = [
    ["Leads no total", LEADS.length],
    ["Contatados",     LEADS.length - cont("novo")],
    ["Em negociação",  cont("negociacao") + cont("matriculado")],
    ["Matriculados",   cont("matriculado")],
  ];
  const topo = Math.max(1, etapas[0][1]);
  $("#funilLeads").innerHTML = `<div class="funil">${etapas.map(([r, v], i) => {
    const larg = Math.max(14, v / topo * 100);
    const antes = i ? etapas[i - 1][1] : 0;
    const taxa = i && antes ? (v / antes * 100).toFixed(0) + "%" : "";
    return `<div class="funil-etapa">
      <div class="funil-barra" style="width:${larg}%;opacity:${1 - i * .17}"></div>
      <div class="funil-txt"><b>${v.toLocaleString("pt-BR")}</b><span>${r}</span></div>
      ${taxa ? `<span class="funil-taxa">${taxa}</span>` : ""}
    </div>`;
  }).join("")}</div>`;

  /* ---- lista ---- */
  $("#leadsVazio").hidden = !!list.length;
  $("#tabelaLeads").innerHTML = list.map(cartaoLead).join("");
}

/** Um lead = um cartão. Nome, curso, contato, status e ações. */
function cartaoLead(l) {
  const wa = `https://wa.me/55${l.telefone}?text=` + encodeURIComponent(
    `Olá ${l.nome.split(" ")[0]}! Aqui é do Instituto Alfa. Vi que você se interessou por *${l.curso}*. Posso te passar as informações?`);
  return `<article class="item">
    <div class="item-topo">
      <span class="avatar">${esc(iniciais(l.nome))}</span>
      <div class="item-id">
        <b>${esc(l.nome)}</b>
        <small>${esc(l.curso || "—")}</small>
      </div>
      <span class="badge b-${l.status}">${rotulo(l.status)}</span>
    </div>

    <div class="item-dados">
      <span>${esc(formatarTel(l.telefone))}</span>
      ${l.cidade ? `<span>${esc(l.cidade)}</span>` : ""}
      ${l.origem ? `<span>${esc(l.origem)}</span>` : ""}
      <span class="quando">${dataHoraBR(l.created_at)}</span>
    </div>

    <div class="item-acoes">
      <a class="btn-min wa-btn" target="_blank" rel="noopener" href="${wa}">WhatsApp</a>
      <select class="status-sel" data-status="${l.id}" aria-label="Status do lead">
        ${["novo","contatado","negociacao","matriculado","perdido"].map(st =>
          `<option value="${st}" ${l.status === st ? "selected" : ""}>${rotulo(st)}</option>`).join("")}
      </select>
      <button class="btn-min" data-ver="${l.id}">Notas</button>
      <button class="btn-min primario" data-matricular="${l.id}">Matricular</button>
    </div>
  </article>`;
}

const iniciais = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase();

const rotulo = (s) => ({ novo: "Novo", contatado: "Contatado", negociacao: "Negociação",
  matriculado: "Matriculado", perdido: "Perdido" }[s] || s);

function formatarTel(t) {
  const d = String(t || "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return t;
}

["buscaLead", "filtroStatus", "filtroPeriodo"].forEach(id =>
  $("#" + id).addEventListener("input", renderLeads));

/* mudança de status inline */
$("#tabelaLeads").addEventListener("change", async (e) => {
  const sel = e.target.closest("[data-status]");
  if (!sel) return;
  const id = sel.dataset.status;
  const novo = sel.value;
  const patch = { status: novo };
  if (novo === "contatado") patch.contatado_em = new Date().toISOString();
  const { error } = await sb.from("leads").update(patch).eq("id", id);
  if (error) return toast("Não deu para salvar: " + error.message, "bad");
  const l = LEADS.find(x => x.id === id); if (l) Object.assign(l, patch);
  toast("Status atualizado.");
  renderDash();
});

/* ============================================================
   MATRÍCULAS
   ============================================================ */
function renderMatriculas() {
  const q = $("#buscaMat").value.trim().toLowerCase();
  const list = MATRICULAS.filter(m => !q ||
    [m.aluno_nome, m.curso].some(v => String(v || "").toLowerCase().includes(q)));

  /* ---- topo ---- */
  const serie = serieDias(MATRICULAS, "created_at", 7);
  $("#heroMat").innerHTML = hero(
    "h-azul", MATRICULAS.length.toLocaleString("pt-BR"), "Matrículas no total",
    variacao(serieDias(MATRICULAS, "created_at", 14)), barras(serie));

  const novas7 = MATRICULAS.filter(m => new Date(m.created_at) >= Date.now() - 7 * 864e5).length;
  const ticket = MATRICULAS.length
    ? MATRICULAS.reduce((s, m) => s + +m.valor_mensalidade, 0) / MATRICULAS.length : 0;
  const conv = LEADS.length ? (LEADS.filter(l => l.status === "matriculado").length / LEADS.length * 100) : 0;

  $("#tilesMat").innerHTML = `<div class="grade-3">
    ${tile(IC.novo,     novas7,                                   "Novas (7 dias)", "azul")}
    ${tile(IC.dinheiro, BRL(ticket),                              "Ticket médio",   "verde")}
    ${tile(IC.grafico,  conv.toFixed(1).replace(".", ",") + "%",  "Conversão",      "dourado")}
  </div>`;

  /* ---- lista ---- */
  $("#matVazio").hidden = !!list.length;
  $("#tabelaMat").innerHTML = list.map(m => {
    const dele = LANCAMENTOS.filter(x => x.matricula_id === m.id);
    const total = dele.reduce((s, x) => s + +x.valor, 0);
    const pago = dele.filter(x => x.status === "pago").reduce((s, x) => s + +x.valor, 0);
    const atras = dele.some(x => x.status_efetivo === "atrasado");
    const prog = total ? Math.min(100, pago / total * 100) : 0;
    return `<article class="item">
      <div class="item-topo">
        <span class="avatar azul">${esc(iniciais(m.aluno_nome))}</span>
        <div class="item-id">
          <b>${esc(m.aluno_nome)}</b>
          <small>${esc(m.curso)}</small>
        </div>
        <span class="badge b-${m.status}">${m.status}</span>
      </div>

      <div class="item-dados">
        <span>Início ${dataBR(m.data_inicio)}</span>
        <span>${m.parcelas}x de ${BRL(m.valor_mensalidade)}</span>
        ${atras ? `<span class="alerta">em atraso</span>` : ""}
      </div>

      <div class="progresso" title="${BRL(pago)} de ${BRL(total)}">
        <i style="width:${prog}%" class="${atras ? "atras" : ""}"></i>
      </div>
      <div class="progresso-txt"><span>${BRL(pago)} pagos</span><span>de ${BRL(total)}</span></div>

      <div class="item-acoes">
        <button class="btn-min" data-parcelas="${m.id}">Parcelas</button>
        <button class="btn-min perigo" data-cancelar-mat="${m.id}">Cancelar</button>
      </div>
    </article>`;
  }).join("");
}
$("#buscaMat").addEventListener("input", renderMatriculas);

/* ============================================================
   FINANCEIRO
   ============================================================ */
function finFiltrado() {
  const st = $("#filtroFinStatus").value;
  const tp = $("#filtroFinTipo").value;
  const mes = $("#filtroFinMes").value;
  return LANCAMENTOS.filter(x => {
    if (st && x.status_efetivo !== st) return false;
    if (tp && x.tipo !== tp) return false;
    if (mes && !x.vencimento.startsWith(mes)) return false;
    return true;
  });
}

function renderFinanceiro() {
  const list = finFiltrado();
  const ent = list.filter(x => x.tipo === "entrada");
  const sai = list.filter(x => x.tipo === "saida");
  const recebido  = ent.filter(x => x.status === "pago").reduce((s, x) => s + +x.valor, 0);
  const pagoSaida = sai.filter(x => x.status === "pago").reduce((s, x) => s + +x.valor, 0);
  const pendente  = ent.filter(x => x.status_efetivo === "pendente").reduce((s, x) => s + +x.valor, 0);
  const atrasado  = ent.filter(x => x.status_efetivo === "atrasado").reduce((s, x) => s + +x.valor, 0);
  const lucro     = recebido - pagoSaida;
  const margem    = recebido ? (lucro / recebido * 100) : 0;

  /* ---- topo: entradas recebidas por dia ---- */
  const pagos = ent.filter(x => x.pago_em);
  const serie = serieDias(pagos, "pago_em", 14);
  $("#heroFin").innerHTML = hero(
    "h-verde", BRL(recebido), "Recebido no filtro",
    variacao(serie), sparkline(serie.map(d => d.n)));

  $("#kpisFin").innerHTML = `<div class="grade-3">
    ${tile(IC.dinheiro, BRL(lucro),                                "Saldo do período", lucro >= 0 ? "verde" : "vermelho")}
    ${tile(IC.grafico,  margem.toFixed(1).replace(".", ",") + "%", "Margem",           "dourado")}
    ${tile(IC.alerta,   BRL(atrasado),                             "Em atraso",        atrasado ? "vermelho" : "")}
  </div>`;

  $("#resumoFin").innerHTML = `<div class="resumo">
    <div><span>Entradas recebidas</span><b class="v-ok">${BRL(recebido)}</b></div>
    <div><span>Saídas pagas</span><b class="v-bad">${BRL(pagoSaida)}</b></div>
    <div><span>Saldo</span><b class="${lucro >= 0 ? "v-ok" : "v-bad"}">${BRL(lucro)}</b></div>
    <div><span>A receber (no prazo)</span><b class="v-warn">${BRL(pendente)}</b></div>
    <div><span>Inadimplência</span><b class="${atrasado ? "v-bad" : ""}">${BRL(atrasado)}</b></div>
  </div>`;

  $("#finVazio").hidden = !!list.length;
  $("#tabelaFin").innerHTML = list.map(x => cartaoLancamento(x, false)).join("");
}

/** Um lançamento = um cartão. `curto` esconde as ações de excluir. */
function cartaoLancamento(x, curto) {
  return `<article class="item lanc">
    <div class="item-topo">
      <span class="avatar ${x.tipo === "saida" ? "vermelho" : "verde"}">${x.tipo === "saida" ? "−" : "+"}</span>
      <div class="item-id">
        <b>${esc(x.descricao)}</b>
        <small>${esc(x.aluno_nome || x.categoria || "—")}</small>
      </div>
      <div class="lanc-valor ${x.tipo}">${x.tipo === "saida" ? "−" : "+"}${BRL(x.valor)}</div>
    </div>

    <div class="item-dados">
      <span>Vence ${dataBR(x.vencimento)}</span>
      ${x.pago_em ? `<span>Pago ${dataBR(x.pago_em)}</span>` : ""}
      <span class="badge b-${x.status_efetivo}">${x.status_efetivo}</span>
    </div>

    <div class="item-acoes">
      ${x.status === "pago"
        ? `<button class="btn-min" data-desfazer="${x.id}">Desfazer</button>`
        : `<button class="btn-min primario" data-pagar="${x.id}">Marcar pago</button>`}
      ${curto ? "" : `<button class="btn-min perigo" data-apagar-lanc="${x.id}">Excluir</button>`}
    </div>
  </article>`;
}
["filtroFinStatus", "filtroFinTipo", "filtroFinMes"].forEach(id =>
  $("#" + id).addEventListener("input", renderFinanceiro));

/* ============================================================
   AÇÕES GLOBAIS (delegação)
   ============================================================ */
document.addEventListener("click", async (e) => {
  const alvo = (a) => e.target.closest(`[${a}]`);

  /* marcar pago */
  const p = alvo("data-pagar");
  if (p) {
    const id = p.getAttribute("data-pagar");
    const { error } = await sb.from("lancamentos")
      .update({ status: "pago", pago_em: hoje() }).eq("id", id);
    if (error) return toast(error.message, "bad");
    toast("Pagamento registrado."); return carregarTudo();
  }

  /* desfazer pagamento */
  const d = alvo("data-desfazer");
  if (d) {
    const { error } = await sb.from("lancamentos")
      .update({ status: "pendente", pago_em: null }).eq("id", d.getAttribute("data-desfazer"));
    if (error) return toast(error.message, "bad");
    toast("Pagamento desfeito."); return carregarTudo();
  }

  /* excluir lançamento */
  const ap = alvo("data-apagar-lanc");
  if (ap) {
    if (!confirm("Excluir este lançamento? Não dá para desfazer.")) return;
    const { error } = await sb.from("lancamentos").delete().eq("id", ap.getAttribute("data-apagar-lanc"));
    if (error) return toast(error.message, "bad");
    toast("Lançamento excluído."); return carregarTudo();
  }

  /* cancelar matrícula */
  const cm = alvo("data-cancelar-mat");
  if (cm) {
    if (!confirm("Cancelar esta matrícula? As parcelas pendentes serão canceladas também.")) return;
    const id = cm.getAttribute("data-cancelar-mat");
    await sb.from("matriculas").update({ status: "cancelada" }).eq("id", id);
    await sb.from("lancamentos").update({ status: "cancelado" }).eq("matricula_id", id).eq("status", "pendente");
    toast("Matrícula cancelada."); return carregarTudo();
  }

  /* ver parcelas */
  const pc = alvo("data-parcelas");
  if (pc) return verParcelas(pc.getAttribute("data-parcelas"));

  /* notas do lead */
  const vl = alvo("data-ver");
  if (vl) return abrirNotas(vl.getAttribute("data-ver"));

  /* matricular a partir do lead */
  const ml = alvo("data-matricular");
  if (ml) return formMatricula(LEADS.find(x => x.id === ml.getAttribute("data-matricular")));
});

$("#btnNovaMatricula").addEventListener("click", () => formMatricula(null));
$("#btnNovoLanc").addEventListener("click", () => formLancamento());

/* ============================================================
   DIÁLOGOS
   ============================================================ */
const dlg = $("#dlg");
const fecharDlg = () => dlg.close();
dlg.addEventListener("click", (e) => {
  if (e.target === dlg || e.target.closest("[data-cancelar]")) fecharDlg();
});

function abrirNotas(id) {
  const l = LEADS.find(x => x.id === id); if (!l) return;
  dlg.innerHTML = `<div class="dlg-card">
    <h2>${esc(l.nome)}</h2>
    <div class="dlg-info">
      <div><span>Curso</span><b>${esc(l.curso)}</b></div>
      <div><span>WhatsApp</span><b>${esc(formatarTel(l.telefone))}</b></div>
      <div><span>E-mail</span><b>${esc(l.email)}</b></div>
      <div><span>Idade</span><b>${l.idade ?? "—"}</b></div>
      <div><span>Cidade</span><b>${esc(l.cidade || "—")}</b></div>
      <div><span>Origem</span><b>${esc(l.origem || "—")}</b></div>
      <div><span>Cadastro</span><b>${dataHoraBR(l.created_at)}</b></div>
    </div>
    <form id="fNotas" style="margin-top:16px">
      <div class="campo">
        <label for="n-resp">Responsável pelo atendimento</label>
        <input id="n-resp" value="${esc(l.responsavel || "")}" placeholder="Quem está falando com o lead">
      </div>
      <div class="campo">
        <label for="n-obs">Observações</label>
        <textarea id="n-obs" placeholder="O que ficou combinado, objeções, próximo passo…">${esc(l.observacoes || "")}</textarea>
      </div>
      <div class="dlg-acoes">
        <button type="button" class="btn-min" data-cancelar>Fechar</button>
        <button type="submit" class="btn-min primario">Salvar</button>
      </div>
    </form></div>`;
  dlg.showModal();
  $("#fNotas").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const patch = { responsavel: $("#n-resp").value.trim() || null, observacoes: $("#n-obs").value.trim() || null };
    const { error } = await sb.from("leads").update(patch).eq("id", id);
    if (error) return toast(error.message, "bad");
    Object.assign(l, patch); fecharDlg(); toast("Anotações salvas.");
  });
}

function formMatricula(lead) {
  const opts = AREAS.map(a => `<optgroup label="${esc(a.nome)}">` +
    CURSOS.filter(c => c.area === a.id).map(c =>
      `<option value="${c.slug}" ${lead && lead.curso_slug === c.slug ? "selected" : ""}>${esc(c.nome)}</option>`
    ).join("") + `</optgroup>`).join("");

  dlg.innerHTML = `<div class="dlg-card">
    <h2>Nova matrícula</h2>
    <form id="fMat">
      <div class="campo"><label for="m-nome">Aluno *</label>
        <input id="m-nome" required value="${esc(lead ? lead.nome : "")}"></div>
      <div class="f2">
        <div class="campo"><label for="m-tel">WhatsApp</label>
          <input id="m-tel" value="${esc(lead ? lead.telefone : "")}"></div>
        <div class="campo"><label for="m-email">E-mail</label>
          <input id="m-email" type="email" value="${esc(lead ? lead.email : "")}"></div>
      </div>
      <div class="campo"><label for="m-curso">Curso *</label>
        <select id="m-curso" required><option value="">Selecione…</option>${opts}</select></div>
      <div class="f2">
        <div class="campo"><label for="m-matricula">Valor da matrícula (R$)</label>
          <input id="m-matricula" type="number" step="0.01" min="0" value="0"></div>
        <div class="campo"><label for="m-mensal">Mensalidade (R$)</label>
          <input id="m-mensal" type="number" step="0.01" min="0" value="0"></div>
      </div>
      <div class="f2">
        <div class="campo"><label for="m-parcelas">Nº de mensalidades</label>
          <input id="m-parcelas" type="number" min="0" max="48" value="12"></div>
        <div class="campo"><label for="m-dia">Dia do vencimento</label>
          <input id="m-dia" type="number" min="1" max="28" value="10"></div>
      </div>
      <div class="campo"><label for="m-inicio">Início do curso</label>
        <input id="m-inicio" type="date" value="${hoje()}"></div>
      <p class="sub" style="color:var(--muted-2);font-size:.8rem">
        As parcelas são geradas automaticamente no Financeiro assim que você salvar.</p>
      <div class="dlg-acoes">
        <button type="button" class="btn-min" data-cancelar>Cancelar</button>
        <button type="submit" class="btn-min primario">Criar matrícula</button>
      </div>
    </form></div>`;
  dlg.showModal();

  $("#fMat").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const slug = $("#m-curso").value;
    const c = CURSOS.find(x => x.slug === slug);
    const row = {
      lead_id: lead ? lead.id : null,
      aluno_nome: $("#m-nome").value.trim(),
      aluno_telefone: $("#m-tel").value.replace(/\D/g, "") || null,
      aluno_email: $("#m-email").value.trim() || null,
      curso: c ? c.nome : slug, curso_slug: slug,
      modalidade: c ? c.modalidade : null, cidade: c ? c.cidade : null,
      valor_matricula: +$("#m-matricula").value || 0,
      valor_mensalidade: +$("#m-mensal").value || 0,
      parcelas: +$("#m-parcelas").value || 0,
      dia_vencimento: +$("#m-dia").value || 10,
      data_inicio: $("#m-inicio").value || hoje(),
    };
    const { error } = await sb.from("matriculas").insert(row);
    if (error) return toast(error.message, "bad");
    if (lead) await sb.from("leads").update({ status: "matriculado" }).eq("id", lead.id);
    fecharDlg(); toast("Matrícula criada e parcelas geradas."); carregarTudo();
  });
}

function formLancamento() {
  const mats = MATRICULAS.filter(m => m.status === "ativa");
  dlg.innerHTML = `<div class="dlg-card">
    <h2>Novo lançamento</h2>
    <form id="fLanc">
      <div class="campo"><label for="x-desc">Descrição *</label>
        <input id="x-desc" required placeholder="Ex.: Aluguel da sala, Material didático…"></div>
      <div class="f2">
        <div class="campo"><label for="x-tipo">Tipo</label>
          <select id="x-tipo"><option value="entrada">Entrada (dinheiro que entra)</option>
            <option value="saida">Saída (despesa)</option></select></div>
        <div class="campo"><label for="x-valor">Valor (R$) *</label>
          <input id="x-valor" type="number" step="0.01" min="0" required></div>
      </div>
      <div class="f2">
        <div class="campo"><label for="x-cat">Categoria</label>
          <input id="x-cat" list="cats" placeholder="mensalidade, aluguel…">
          <datalist id="cats">
            <option>mensalidade</option><option>matricula</option><option>material</option>
            <option>aluguel</option><option>professor</option><option>marketing</option>
            <option>energia</option><option>internet</option><option>outros</option>
          </datalist></div>
        <div class="campo"><label for="x-venc">Vencimento *</label>
          <input id="x-venc" type="date" required value="${hoje()}"></div>
      </div>
      <div class="campo"><label for="x-mat">Vincular a uma matrícula (opcional)</label>
        <select id="x-mat"><option value="">Nenhuma</option>
          ${mats.map(m => `<option value="${m.id}">${esc(m.aluno_nome)} — ${esc(m.curso)}</option>`).join("")}
        </select></div>
      <div class="campo"><label><input type="checkbox" id="x-pago" style="width:auto;margin-right:8px">
        Já está pago</label></div>
      <div class="dlg-acoes">
        <button type="button" class="btn-min" data-cancelar>Cancelar</button>
        <button type="submit" class="btn-min primario">Salvar</button>
      </div>
    </form></div>`;
  dlg.showModal();

  $("#fLanc").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const pago = $("#x-pago").checked;
    const { error } = await sb.from("lancamentos").insert({
      descricao: $("#x-desc").value.trim(),
      tipo: $("#x-tipo").value,
      categoria: $("#x-cat").value.trim() || null,
      valor: +$("#x-valor").value,
      vencimento: $("#x-venc").value,
      matricula_id: $("#x-mat").value || null,
      status: pago ? "pago" : "pendente",
      pago_em: pago ? hoje() : null,
    });
    if (error) return toast(error.message, "bad");
    fecharDlg(); toast("Lançamento salvo."); carregarTudo();
  });
}

function verParcelas(matId) {
  const m = MATRICULAS.find(x => x.id === matId);
  const linhas = LANCAMENTOS.filter(x => x.matricula_id === matId);
  dlg.innerHTML = `<div class="dlg-card">
    <h2>${esc(m.aluno_nome)}</h2>
    <p class="sub" style="color:var(--muted);margin-bottom:14px">${esc(m.curso)}</p>
    <div class="tabela-wrap"><table class="tabela" style="min-width:0">
      <thead><tr><th>Venc.</th><th>Descrição</th><th>Valor</th><th>Situação</th><th></th></tr></thead>
      <tbody>${linhas.map(x => `<tr>
        <td class="num">${dataBR(x.vencimento)}</td>
        <td>${esc(x.descricao)}</td>
        <td class="num">${BRL(x.valor)}</td>
        <td><span class="badge b-${x.status_efetivo}">${x.status_efetivo}</span></td>
        <td>${x.status === "pago"
          ? `<button class="btn-min" data-desfazer="${x.id}">Desfazer</button>`
          : `<button class="btn-min primario" data-pagar="${x.id}">Pago</button>`}</td>
      </tr>`).join("")}</tbody></table></div>
    <div class="dlg-acoes"><button class="btn-min" data-cancelar>Fechar</button></div></div>`;
  dlg.showModal();
}

/* ============================================================
   EXPORTAR CSV
   ============================================================ */
function baixarCSV(nome, linhas) {
  if (!linhas.length) return toast("Nada para exportar.", "bad");
  const cols = Object.keys(linhas[0]);
  const csv = "\uFEFF" + [cols.join(";"),
    ...linhas.map(l => cols.map(c => `"${String(l[c] ?? "").replace(/"/g, '""')}"`).join(";"))
  ].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${nome}-${hoje()}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
}

$("#btnCSV").addEventListener("click", () => baixarCSV("leads-alfa",
  leadsFiltrados().map(l => ({
    Data: dataHoraBR(l.created_at), Nome: l.nome, WhatsApp: formatarTel(l.telefone),
    Email: l.email, Idade: l.idade, Curso: l.curso, Modalidade: l.modalidade,
    Cidade: l.cidade, Origem: l.origem, Campanha: l.utm_campaign,
    Status: rotulo(l.status), Responsavel: l.responsavel, Observacoes: l.observacoes,
  }))));

$("#btnCSVFin").addEventListener("click", () => baixarCSV("financeiro-alfa",
  finFiltrado().map(x => ({
    Vencimento: dataBR(x.vencimento), Descricao: x.descricao, Aluno: x.aluno_nome,
    Categoria: x.categoria, Tipo: x.tipo, Valor: (+x.valor).toFixed(2).replace(".", ","),
    Situacao: x.status_efetivo, PagoEm: x.pago_em ? dataBR(x.pago_em) : "",
  }))));

/* ============================================================ */
iniciar();
