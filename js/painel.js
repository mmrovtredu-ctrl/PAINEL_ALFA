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
$("#abas").addEventListener("click", (e) => {
  const b = e.target.closest(".aba");
  if (!b) return;
  $$(".aba").forEach(a => a.classList.toggle("active", a === b));
  $$(".tab").forEach(t => (t.hidden = t.id !== "tab-" + b.dataset.tab));
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
   DASHBOARD
   ============================================================ */
function renderDash() {
  const d30 = Date.now() - 30 * 864e5;
  const d7  = Date.now() - 7 * 864e5;
  const novos30 = LEADS.filter(l => new Date(l.created_at) >= d30).length;
  const novos7  = LEADS.filter(l => new Date(l.created_at) >= d7).length;
  const matric  = LEADS.filter(l => l.status === "matriculado").length;
  const conv    = LEADS.length ? (matric / LEADS.length * 100).toFixed(1) : "0";

  const recebido = LANCAMENTOS.filter(x => x.tipo === "entrada" && x.status === "pago")
    .reduce((s, x) => s + +x.valor, 0);
  const aReceber = LANCAMENTOS.filter(x => x.tipo === "entrada" && x.status_efetivo === "pendente")
    .reduce((s, x) => s + +x.valor, 0);
  const atrasado = LANCAMENTOS.filter(x => x.status_efetivo === "atrasado" && x.tipo === "entrada")
    .reduce((s, x) => s + +x.valor, 0);

  $("#kpis").innerHTML = `
    ${kpi("Leads (7 dias)", novos7, `${novos30} nos últimos 30 dias`)}
    ${kpi("Leads no total", LEADS.length, `${LEADS.filter(l => l.status === "novo").length} ainda sem contato`)}
    ${kpi("Taxa de matrícula", conv + "%", `${matric} leads viraram aluno`, matric ? "ok" : "")}
    ${kpi("Matrículas ativas", MATRICULAS.filter(m => m.status === "ativa").length, "alunos em curso")}
    ${kpi("Recebido", BRL(recebido), "lançamentos pagos", "ok")}
    ${kpi("A receber", BRL(aReceber), "ainda no prazo", "warn")}
    ${kpi("Em atraso", BRL(atrasado), "vencidos e não pagos", atrasado ? "bad" : "")}`;

  /* leads por dia — 30 barras */
  const dias = [];
  for (let i = 29; i >= 0; i--) {
    const dt = new Date(Date.now() - i * 864e5);
    const chave = dt.toISOString().slice(0, 10);
    dias.push({ chave, label: dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      n: LEADS.filter(l => l.created_at.slice(0, 10) === chave).length });
  }
  const max = Math.max(1, ...dias.map(d => d.n));
  $("#graficoLeads").innerHTML = dias.map(d =>
    `<div class="barra" style="height:${Math.max(3, d.n / max * 100)}%" data-t="${d.label}: ${d.n} lead${d.n === 1 ? "" : "s"}"></div>`).join("");

  /* ranking de cursos */
  const cont = {};
  LEADS.forEach(l => (cont[l.curso] = (cont[l.curso] || 0) + 1));
  const top = Object.entries(cont).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxC = top.length ? top[0][1] : 1;
  $("#rankCursos").innerHTML = top.length
    ? top.map(([nome, n]) => `<div class="rank-item"><span>${esc(nome)}</span><b>${n}</b>
        <div class="rank-bar"><i style="width:${n / maxC * 100}%"></i></div></div>`).join("")
    : `<p class="vaziomsg">Sem leads ainda.</p>`;

  /* próximos vencimentos */
  const lim = new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10);
  const prox = LANCAMENTOS.filter(x => x.status === "pendente" && x.vencimento <= lim)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento)).slice(0, 12);
  $("#proxVencimentos").innerHTML = prox.length ? `
    <div class="tabela-wrap"><table class="tabela"><thead><tr>
      <th>Vencimento</th><th>Descrição</th><th>Aluno</th><th>Valor</th><th>Situação</th><th></th></tr></thead>
      <tbody>${prox.map(x => `<tr class="linha">
        <td class="num c-quando" data-l="Vencimento">${dataBR(x.vencimento)}</td>
        <td class="c-titulo" data-l="Descrição">${esc(x.descricao)}</td>
        <td class="sub c-sub" data-l="Aluno">${esc(x.aluno_nome || "—")}</td>
        <td class="num ${x.tipo} c-valor" data-l="Valor">${x.tipo === "saida" ? "−" : ""}${BRL(x.valor)}</td>
        <td class="c-status" data-l="Situação"><span class="badge b-${x.status_efetivo}">${x.status_efetivo}</span></td>
        <td class="c-acoes" data-l="Ações"><button class="btn-min" data-pagar="${x.id}">Marcar pago</button></td>
      </tr>`).join("")}</tbody></table></div>`
    : `<p class="vaziomsg">Nada vencendo nos próximos 15 dias.</p>`;
}

const kpi = (k, v, d, cls = "") =>
  `<div class="kpi ${cls}"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;

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
  $("#leadsVazio").hidden = !!list.length;
  $("#tabelaLeads").innerHTML = !list.length ? "" : `
    <thead><tr>
      <th>Quando</th><th>Nome</th><th>Contato</th><th>Curso</th>
      <th>Idade</th><th>Cidade</th><th>Origem</th><th>Status</th><th>Ações</th>
    </tr></thead>
    <tbody>${list.map(l => `<tr class="linha">
      <td class="num sub c-quando" data-l="Quando">${dataHoraBR(l.created_at)}</td>
      <td class="c-titulo" data-l="Nome"><div class="nome">${esc(l.nome)}</div></td>
      <td data-l="Contato">
        <div class="num">${esc(formatarTel(l.telefone))}</div>
        <div class="sub">${esc(l.email)}</div>
      </td>
      <td class="c-sub" data-l="Curso">${esc(l.curso)}<div class="sub">${esc(l.modalidade || "")}</div></td>
      <td class="num" data-l="Idade">${l.idade ?? "—"}</td>
      <td class="sub" data-l="Cidade">${esc(l.cidade || "—")}</td>
      <td class="sub" data-l="Origem">${esc(l.origem || "—")}${l.utm_campaign ? `<div class="sub">${esc(l.utm_campaign)}</div>` : ""}</td>
      <td class="c-status" data-l="Status">
        <select class="status-sel" data-status="${l.id}">
          ${["novo","contatado","negociacao","matriculado","perdido"].map(s =>
            `<option value="${s}" ${l.status === s ? "selected" : ""}>${rotulo(s)}</option>`).join("")}
        </select>
      </td>
      <td class="c-acoes" data-l="Ações"><div class="acoes">
        <a class="btn-min wa-btn" target="_blank" rel="noopener"
           href="https://wa.me/55${l.telefone}?text=${encodeURIComponent(
             `Olá ${l.nome.split(" ")[0]}! Aqui é do Instituto Alfa 👋 Vi que você se interessou por *${l.curso}*. Posso te passar as informações?`)}">WhatsApp</a>
        <button class="btn-min" data-ver="${l.id}">Notas</button>
        <button class="btn-min primario" data-matricular="${l.id}">Matricular</button>
      </div></td>
    </tr>`).join("")}</tbody>`;
}

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

  $("#matVazio").hidden = !!list.length;
  $("#tabelaMat").innerHTML = !list.length ? "" : `
    <thead><tr><th>Aluno</th><th>Curso</th><th>Início</th><th>Matrícula</th>
      <th>Mensalidade</th><th>Parcelas</th><th>Pago / Total</th><th>Status</th><th></th></tr></thead>
    <tbody>${list.map(m => {
      const dele = LANCAMENTOS.filter(x => x.matricula_id === m.id);
      const total = dele.reduce((s, x) => s + +x.valor, 0);
      const pago = dele.filter(x => x.status === "pago").reduce((s, x) => s + +x.valor, 0);
      const atras = dele.some(x => x.status_efetivo === "atrasado");
      return `<tr class="linha">
        <td class="c-titulo" data-l="Aluno"><div class="nome">${esc(m.aluno_nome)}</div>
            <div class="sub">${esc(formatarTel(m.aluno_telefone) || "")}</div></td>
        <td class="c-sub" data-l="Curso">${esc(m.curso)}<div class="sub">${esc(m.cidade || m.modalidade || "")}</div></td>
        <td class="num" data-l="Início">${dataBR(m.data_inicio)}</td>
        <td class="num" data-l="Matrícula">${BRL(m.valor_matricula)}</td>
        <td class="num" data-l="Mensalidade">${BRL(m.valor_mensalidade)}</td>
        <td class="num" data-l="Parcelas">${m.parcelas}x</td>
        <td class="num" data-l="Pago / Total">${BRL(pago)} <span class="sub">/ ${BRL(total)}</span>
            ${atras ? ` <span class="badge b-atrasado">atraso</span>` : ""}</td>
        <td class="c-status" data-l="Status"><span class="badge b-${m.status}">${m.status}</span></td>
        <td class="c-acoes" data-l="Ações"><div class="acoes">
          <button class="btn-min" data-parcelas="${m.id}">Parcelas</button>
          <button class="btn-min perigo" data-cancelar-mat="${m.id}">Cancelar</button>
        </div></td>
      </tr>`;
    }).join("")}</tbody>`;
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
  const recebido = ent.filter(x => x.status === "pago").reduce((s, x) => s + +x.valor, 0);
  const pagoSaida = sai.filter(x => x.status === "pago").reduce((s, x) => s + +x.valor, 0);
  const pendente = ent.filter(x => x.status_efetivo === "pendente").reduce((s, x) => s + +x.valor, 0);
  const atrasado = ent.filter(x => x.status_efetivo === "atrasado").reduce((s, x) => s + +x.valor, 0);

  $("#kpisFin").innerHTML = `
    ${kpi("Entradas recebidas", BRL(recebido), `${ent.filter(x => x.status === "pago").length} lançamentos`, "ok")}
    ${kpi("Saídas pagas", BRL(pagoSaida), `${sai.filter(x => x.status === "pago").length} lançamentos`, "bad")}
    ${kpi("Saldo do filtro", BRL(recebido - pagoSaida), "recebido − pago", recebido - pagoSaida >= 0 ? "ok" : "bad")}
    ${kpi("A receber", BRL(pendente), "dentro do prazo", "warn")}
    ${kpi("Inadimplência", BRL(atrasado), `${ent.filter(x => x.status_efetivo === "atrasado").length} vencidos`, atrasado ? "bad" : "")}`;

  $("#finVazio").hidden = !!list.length;
  $("#tabelaFin").innerHTML = !list.length ? "" : `
    <thead><tr><th>Vencimento</th><th>Descrição</th><th>Aluno</th><th>Categoria</th>
      <th>Valor</th><th>Situação</th><th>Pago em</th><th></th></tr></thead>
    <tbody>${list.map(x => `<tr class="linha">
      <td class="num c-quando" data-l="Vencimento">${dataBR(x.vencimento)}</td>
      <td class="c-titulo" data-l="Descrição">${esc(x.descricao)}</td>
      <td class="sub c-sub" data-l="Aluno">${esc(x.aluno_nome || "—")}</td>
      <td class="sub" data-l="Categoria">${esc(x.categoria || "—")}</td>
      <td class="num ${x.tipo} c-valor" data-l="Valor">${x.tipo === "saida" ? "−" : "+"}${BRL(x.valor)}</td>
      <td class="c-status" data-l="Situação"><span class="badge b-${x.status_efetivo}">${x.status_efetivo}</span></td>
      <td class="num sub" data-l="Pago em">${x.pago_em ? dataBR(x.pago_em) : "—"}</td>
      <td class="c-acoes" data-l="Ações"><div class="acoes">
        ${x.status === "pago"
          ? `<button class="btn-min" data-desfazer="${x.id}">Desfazer</button>`
          : `<button class="btn-min primario" data-pagar="${x.id}">Marcar pago</button>`}
        <button class="btn-min perigo" data-apagar-lanc="${x.id}">Excluir</button>
      </div></td>
    </tr>`).join("")}</tbody>`;
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
