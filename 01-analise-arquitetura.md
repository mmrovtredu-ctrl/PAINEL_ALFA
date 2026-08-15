# Instituto Alfa — Análise do sistema atual e arquitetura proposta

Fontes: repositório `mmrovtredu-ctrl/institutoalfa` (site público), repositório `PAINEL_ALFA` (painel) e inspeção ao vivo de `painel-alfa-nu.vercel.app`, em 15/08/2026.

> **v2** — revisado depois da leitura do código-fonte do painel. As correções estão marcadas ao longo do texto. Requisitos de uso no iPhone: ver `03-mobile-iphone.md`.

---

## 0. Três correções ao enunciado, antes de tudo

**0.1 — São 121 cursos, não 1.212.** `js/cursos.js` tem exatamente 121 objetos em `CURSOS`, distribuídos em 9 áreas. Isso muda o dimensionamento: 121 cursos cabem em memória, cabem num `<select>`, cabem numa tabela sem paginação agressiva. O volume real que preocupa é o de **eventos**, não o de cursos.

| Área | Cursos |
|---|---|
| Informática e Tecnologia | 44 |
| Administração e Negócios | 16 |
| Educação e Preparatórios | 14 |
| Industrial e Operacional | 13 |
| Saúde e Bem-estar | 12 |
| Serviços e Atendimento | 10 |
| Cursos Técnicos | 5 |
| Beleza e Estética | 4 |
| Idiomas | 3 |

112 são EAD, 9 presenciais. **109 usam descrição genérica de área** (`curado: false`) — o próprio README reconhece que isso converte menos. Esse é, provavelmente, o maior ganho de conversão disponível hoje, e é conteúdo, não código.

**0.2 — Hoje "clicar no WhatsApp" e "virar lead" são o mesmo evento.** Todos os botões `.wa` do site (inclusive o FAB "Fale conosco") são interceptados por `bindCTAs()` e abrem o **formulário**, não o WhatsApp. O WhatsApp só abre depois do `submit`, já com o lead gravado. Ou seja: o funil que o prompt pede — `CLIQUE → LEAD` — tem taxa de 100% por construção. Separar essas etapas exige mudar o comportamento do site, não só instrumentá-lo. (Veja §6.2.)

**0.3 — São dois repositórios com uma fonte comum.** `config.js`, `db.js` e `cursos.js` começam com:

> `GERADO POR sincronizar.mjs — NÃO EDITE ESTE ARQUIVO. Edite compartilhado/…`

A estrutura real, confirmada nos dois repos:

| Arquivo | Onde é fonte |
|---|---|
| `compartilhado/config.js`, `db.js`, `cursos.js` | fonte comum, copiada para os dois repos |
| `js/script.js`, `css/styles.css` | fonte, no repo `institutoalfa` |
| `js/painel.js`, `css/painel.css` | fonte, no repo `PAINEL_ALFA` |
| `sincronizar.mjs`, `sql/schema.sql` | **não estão em nenhum dos dois repos** — localizar antes da Fase 0 |

Editar `js/config.js`, `js/db.js` ou `js/cursos.js` em qualquer um dos repos é trabalho que a próxima sincronização apaga.

---

## 1. Estrutura atual

### Site público (`institutoalfa`)

| Item | O que é |
|---|---|
| Framework | Nenhum. HTML/CSS/JS puro, ES Modules nativos, sem build |
| Páginas | **Uma só** (`index.html`, 18 KB). Cursos abrem em `<dialog>`, sem rota própria |
| Catálogo | `js/cursos.js` (159 KB) — array `CURSOS` com 121 objetos + `AREAS` |
| Banco | Supabase `moxffkuqvblscmeoolrr`, acessado direto do browser |
| Camada de dados | `js/db.js` — `salvarLead()`, `contexto()` (UTM), fila offline em `localStorage` |
| Animações | anime.js 4.5 via CDN, degrada sem quebrar |
| Analytics | **Nenhum.** Sem GA, sem Pixel, sem nada |
| Hospedagem | Vercel, headers de cache e segurança em `vercel.json` |

### Painel (`painel-alfa-nu.vercel.app`)

| Item | O que é |
|---|---|
| Framework | Nenhum. `painel.html` + `js/painel.js` (~29 KB) |
| Auth | Supabase Auth e-mail/senha, token em `localStorage` |
| Abas | Visão geral · Leads · Matrículas · Financeiro |
| Carregamento | `select('*')` das três tabelas no load, com `limit` de 2000 / 2000 / 5000, tudo agregado em memória |
| Estado dos dados | **Zero linhas.** Todos os KPIs em 0 |

---

## 2. Banco de dados

**`leads`** — `id`, `created_at`, `nome`, `email`, `telefone`, `idade`, `cidade`, `curso`, **`curso_slug`**, `area`, `modalidade`, `origem`, `utm_source`, `utm_medium`, `utm_campaign`, `status`, `observacoes`, `contatado_em`, `responsavel`

> Detalhe que muda o plano: **`curso_slug` já existe e já é gravado**. A chave estável de curso que o prompt precisa **já está no banco**. Não é preciso desambiguar texto livre — basta criar a tabela `courses` e ligar por `slug`.

**`matriculas`** — `id`, `created_at`, **`lead_id`**, `aluno_nome`, `aluno_telefone`, `aluno_email`, `curso`, **`curso_slug`**, `modalidade`, `cidade`, `valor_matricula`, `valor_mensalidade`, `parcelas`, `dia_vencimento`, `data_inicio`, `status` (`ativa`|`cancelada`), `observacoes`

> **Correção da v1:** `matriculas.lead_id` **já existe**. A atribuição lead → venda, que eu tinha dado como inexistente, já é possível hoje. E as parcelas são geradas por **trigger no Postgres**, não pelo JavaScript — o painel só faz o `insert` da matrícula. Não recriar isso na aplicação.

**`lancamentos`** — `vencimento`, `descricao`, `tipo` (`entrada`|`saida`), `valor`, `categoria`, `matricula_id`, `pago_em`, `responsavel`, `status` (`pago`|`pendente`|`cancelado`)

**`v_financeiro`** — view que deriva `status_efetivo` (pago / a vencer / atrasado)

**Status de lead** (array hardcoded em `painel.js`): `novo` → `contatado` → `negociacao` → `matriculado` | `perdido`

**RLS** (conforme README): anônimo pode **INSERT** em `leads`; **SELECT** de qualquer coisa exige login. Cadastro público de usuários desligado no Supabase Auth. É uma base correta — precisa ser reauditada quando entrarem papéis e novas tabelas.

**Índice único `(telefone, curso_slug)`** — impede lead duplicado. Efeito colateral relevante: se a mesma pessoa voltar e se cadastrar de novo no mesmo curso, o insert retorna `23505` e o sistema trata como sucesso silencioso. **O segundo interesse não deixa rastro nenhum.** Justamente o sinal que o Lead Score do item 9 mais valoriza.

---

## 3. Fluxo atual do usuário

```
Visitante entra no index.html          ← nenhum rastro registrado
   ↓ navega por áreas / busca          ← nenhum rastro
   ↓ abre o modal de um curso          ← nenhum rastro
   ↓ clica "Quero mais informações"    ← nenhum rastro
   ↓ preenche o formulário
     (honeypot + trava de 2,5 s)
   ↓ submit
     ├── INSERT em `leads`  ────────────▶  única coisa que o banco vê
     └── abre wa.me com a mensagem pronta (nome, curso, e-mail, telefone)
   ↓ conversa acontece no WhatsApp     ← fora do sistema, invisível
   ↓ admin muda o status na mão no painel
   ↓ admin cria matrícula → parcelas → financeiro
```

**Do site inteiro, uma única linha de banco é produzida — e só no fim do funil.** Tudo que vem antes (quais cursos foram vistos, quantas vezes, o que foi buscado, quem voltou) é perdido.

---

## 4. Como o WhatsApp está implementado

```js
// js/config.js
export const WA_NUMBER = "5598985843807";

// js/script.js
function waLink(texto) {
  return "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent(texto);
}
```

Um número único para todos os 121 cursos. A mensagem já leva nome, curso, e-mail, telefone, idade e cidade, e termina com `_EU QUERO SER ALFA_ 🎯`. No painel existe um segundo `wa.me`, de saída, para o admin retomar a conversa.

**Não existe** `whatsapp_click` como evento; não existe `visitor_id`; não existe `session_id`; não existe tabela de eventos.

---

## 5. O que já existe × o que precisa ser criado

| O prompt pede | Situação real |
|---|---|
| Catálogo de cursos no banco | ❌ Só em `js/cursos.js`. Mas `leads.curso_slug` já dá a chave |
| Visitantes / sessões / eventos | ❌ Nada |
| Tracking de comportamento | ❌ Nada |
| Funil visitante → venda | ⚠️ Só a ponta final (lead → matrícula) |
| CRM / Kanban | ❌ Status é um `<select>`, sem histórico |
| Lead score | ❌ Nada — e o índice único apaga o sinal de re-interesse |
| Follow-ups | ❌ Nada |
| Recuperação de leads | ❌ Nada |
| Origem / UTM | ✅ **Já funciona.** `contexto()` captura utm_* e infere origem (anúncio / instagram / site) |
| Vendas / receita | ✅ `matriculas` + `lancamentos` + `v_financeiro` já cobrem |
| Papéis (ADMIN/GERENTE/VENDEDOR/ANALISTA) | ❌ Qualquer login vê tudo |
| Logs administrativos | ❌ Nada |
| Páginas mais acessadas | ⚠️ Só existe **uma** página. Precisa de rotas por curso (§6.4) |

---

## 6. Cinco decisões que precisam ser tomadas antes de escrever código

**6.1 — Onde implementar.** No monorepo com `compartilhado/` e `sincronizar.mjs`. Mexer neste repo público é trabalho jogado fora.

**6.2 — Separar `CLIQUE` de `LEAD` exige mudar o site, não só medir.**
Duas opções, e é uma escolha de negócio:

- **(a) Manter form-first.** O funil fica `visita → curso → formulário aberto → lead → venda`. Mais dados de qualidade, menos leads. `whatsapp_click` vira sinônimo de `lead_created` e o funil do prompt perde uma etapa.
- **(b) Adicionar um botão "Falar direto no WhatsApp"** no modal do curso, ao lado do formulário. Aí `whatsapp_click` passa a existir de verdade, o funil do prompt funciona inteiro — mas parte dos contatos chega sem nome/e-mail no banco.

**Recomendação: (b), com `click_ref`.** Ver 6.3.

**6.3 — A venda acontece no WhatsApp, fora do sistema.** Sem um identificador que atravesse a fronteira, ninguém consegue ligar "quem navegou" a "quem comprou", e o funil vira estimativa. Solução: gerar um código curto (`click_ref`, ex. `A7K2QX`) no clique, gravá-lo no evento e **embuti-lo na mensagem pré-preenchida**. No painel, o vendedor cola o código e o lead herda todo o histórico de navegação daquele visitante. Custo: uma linha na mensagem. Retorno: o funil inteiro deixa de ser chute.

**6.4 — O site tem uma página só.** Sem rota por curso (`/curso/massoterapia-vip`), o item 15 do prompt ("páginas mais acessadas") não tem o que medir, e — mais importante — **121 cursos não recebem uma única visita orgânica do Google**. Gerar páginas estáticas por curso a partir de `cursos.js` resolve SEO e analytics de uma vez. É a maior alavanca de conversão desta lista e não está no prompt original.

**6.5 — O índice único `(telefone, curso_slug)` está apagando sinal.** Manter a proteção anti-duplicata, mas registrar o re-cadastro como evento (`lead_reengaged`) em vez de descartar em silêncio.

**6.6 — O painel subnotifica em silêncio a partir de um certo volume.** `carregarTudo()` traz no máximo 2000 leads, 2000 matrículas e 5000 lançamentos e calcula tudo em memória. Passando disso, os KPIs ficam errados **sem nenhum aviso na tela** — que é o pior tipo de erro num painel de gestão. Com o banco vazio hoje isso não aparece; com um ano de operação, aparece.

**6.7 — O painel vai ser usado no iPhone, não no desktop.** Isso muda decisões estruturais, não só CSS: tab bar em vez de sidebar, cartão em vez de tabela, folha inferior em vez de modal, seleção de etapa em vez de arrastar no Kanban. Especificação completa em `03-mobile-iphone.md`.

---

## 7. Arquitetura proposta

### 7.1 A escolha central: migrar o painel, preservar o site

O site público é rápido, funciona offline, degrada bem e não tem build. Reescrevê-lo em Next.js traz risco alto e ganho baixo. O painel é o oposto: precisa de tabelas paginadas, drag-and-drop, permissões por papel e agregações server-side — tudo que o vanilla JS entrega mal.

> **Proposta: o site público continua estático** (ganha `tracker.js` + páginas por curso geradas no build). **Só o painel migra para Next.js — e nasce como app de iPhone**, com desktop como caso secundário.

### 7.2 Stack

- **Painel:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
- **Dados:** mesmo Supabase, mesmo Auth. Postgres + RLS + `pg_cron`
- **Ingestão:** Route Handler `/api/track` — o browser **nunca** escreve direto em `events`
- **Agregação:** Server Components + funções RPC. O browser recebe números, não linhas
- **Libs:** Recharts (gráficos), dnd-kit (Kanban), TanStack Table + Query (tabelas e cache)
- **Site público:** segue vanilla; `sincronizar.mjs` passa a gerar também as páginas de curso

### 7.3 Fluxo de dados

```
┌──────────────────────────┐   ┌────────────────────┐   ┌────────────────────┐
│ SITE (estático, vanilla) │   │ INGESTÃO           │   │ PAINEL (Next.js)   │
│                          │   │ /api/track         │   │                    │
│ tracker.js               │──▶│ valida + enriquece │──▶│ lê rollups         │
│  · visitor_id (cookie)   │   │ (UA→device/OS,     │   │ e tabelas do CRM   │
│  · session_id (30 min)   │   │  IP→região)        │   │                    │
│  · sendBeacon, em lote   │   │ gera click_ref     │   │ Kanban, follow-ups │
│ /curso/<slug> (SEO)      │   │ nunca confia no    │   │ relatórios         │
│ botão WhatsApp + ref     │   │ payload do cliente │   │                    │
└──────────────────────────┘   └────────────────────┘   └────────────────────┘
                                         │                        ▲
                                         ▼                        │
                        ┌────────────────────────────────────────────┐
                        │ Postgres (Supabase)                        │
                        │  events  ← append-only, particionada/mês   │
                        │     │ pg_cron a cada 15 min                │
                        │     ▼                                      │
                        │  daily_course_stats · daily_traffic_stats  │
                        │  hourly_stats                              │
                        │  (o dashboard NUNCA lê `events` direto)     │
                        └────────────────────────────────────────────┘
```

### 7.4 Identidade do visitante

- `visitor_id` — UUID em cookie first-party, 1 ano, sem dado pessoal
- `session_id` — UUID, expira com 30 min de inatividade
- Ao vincular um `click_ref` a um lead, todo o histórico daquele `visitor_id` passa a pertencer ao lead retroativamente

### 7.5 Modelo de dados

**Reaproveitar sem mexer:** `matriculas`, `lancamentos`, `v_financeiro`.
**Estender:** `leads` (ganha `course_id`, `visitor_id`, `click_ref`, `responsavel_id`, `valor_proposta`, `valor_venda`).

```sql
-- catálogo (fonte da verdade continua sendo cursos.js; o banco é espelho)
course_areas       id, slug, nome, tag, icone
courses            id, slug UNIQUE, nome, area_id, modalidade, carga,
                   preco jsonb, curado bool, ativo bool
                   -- populado por um seed idempotente rodado no deploy

-- comportamento
visitors           id uuid, first_seen_at, last_seen_at, first_source,
                   first_utm_source/medium/campaign, device, os, browser,
                   regiao, total_sessions
sessions           id uuid, visitor_id, started_at, ended_at, entry_page,
                   exit_page, referrer, utm_*, device, duration_seconds
events             id bigserial, visitor_id, session_id, lead_id, course_id,
                   type, page, meta jsonb, created_at
                   -- PARTICIONADA POR MÊS, append-only, sem UPDATE
                   -- idx: (created_at) · (course_id, created_at)
                   --      (visitor_id, created_at) · (type, created_at)
whatsapp_clicks    click_ref text UNIQUE, visitor_id, session_id, course_id,
                   utm_*, created_at, lead_id  -- null até o vendedor vincular

-- CRM
lead_statuses      id, chave, rotulo, ordem, cor, is_ganho, is_perdido
                   -- configurável; substitui o array hardcoded
lead_history       id, lead_id, de_status, para_status, user_id, nota, created_at
lead_scores        lead_id, score, temperatura, calculado_em
score_rules        chave, pontos, ativo        -- pontuação configurável (item 9)
followups          id, lead_id, responsavel_id, data_hora, prioridade,
                   observacao, concluido_em
proposals          id, lead_id, valor, enviada_em, respondida_em, resultado
campaigns          id, nome, utm_source, utm_medium, utm_campaign, custo, periodo

-- acesso
app_users          user_id → auth.users, nome, papel, ativo
                   -- ADMIN | GERENTE | VENDEDOR | ANALISTA
audit_log          id, user_id, acao, entidade, entidade_id, antes, depois, created_at

-- rollups (o que o dashboard lê)
daily_course_stats   dia, course_id, views, unique_visitors, avg_seconds,
                     wa_clicks, leads, matriculas, receita
daily_traffic_stats  dia, source, medium, campaign, visitors, leads,
                     matriculas, receita
hourly_stats         dia, hora, visitors, wa_clicks, leads, matriculas
```

### 7.6 Eventos

```
page_view · course_view · course_search · course_click · whatsapp_click
form_opened · lead_created · lead_reengaged
proposal_sent · sale_completed · lead_lost · followup_created
```

`whatsapp_click` **não é venda.** As etapas ficam explicitamente separadas: `CLIQUE → LEAD → ATENDIMENTO → PROPOSTA → VENDA`.

### 7.7 Permissões (em RLS, não só na UI)

| Papel | Alcance |
|---|---|
| ADMIN | Tudo: financeiro, configurações, logs |
| GERENTE | Tudo menos configurações do sistema e audit log |
| VENDEDOR | **Só os próprios leads e follow-ups.** Sem financeiro global |
| ANALISTA | Analytics e relatórios, **sem telefone/e-mail** dos leads |

---

## 8. Ordem de implementação

Difere do prompt original: **espelhar o catálogo e instrumentar o site vêm antes de qualquer tela.** Enquanto não houver coleta, todo dashboard é enfeite.

| Fase | Entrega | Por quê aqui |
|---|---|---|
| **0** | Monorepo confirmado · tabelas `course_areas`/`courses` + seed idempotente a partir de `cursos.js` · `leads.course_id` · auditoria de RLS | Sem `course_id`, nenhum ranking do item 4 existe |
| **1** | `tracker.js` · `/api/track` · `events`/`visitors`/`sessions` · rollups via `pg_cron` · páginas `/curso/<slug>` · botão WhatsApp direto com `click_ref` | Começa a coletar. Cada dia de atraso é um dia de dados perdidos |
| **2** | Painel Next.js: shell, auth, layout, Dashboard real lendo rollups | Primeira tela útil |
| **3** | Analytics de cursos: 4 rankings + alerta "alto interesse, baixa conversão" | Depende de 0–2 |
| **4** | Leads estendidos · vínculo `click_ref` → lead · timeline do lead | Fecha o funil |
| **5** | CRM / Kanban / `lead_statuses` configurável / `lead_history` | |
| **6** | Lead score + `score_rules` | Precisa de eventos acumulados |
| **7** | Follow-ups + tela "Follow-ups de hoje" | |
| **8** | Recuperação de leads (7 segmentos do item 10) | Depende de 5, 6 e 7 |
| **9** | Relatórios + exportação · Alertas inteligentes · Busca global | |
| **10** | Papéis, RLS fina, audit log, índices, cache, particionamento | |

> **Expectativa realista:** nas Fases 2 e 3 o dashboard vai mostrar quase zero, porque a coleta acabou de começar. Isso é o comportamento **correto**. Estados vazios bem escritos ("ainda sem dados — a coleta começou em 15/08") são requisito de entrega, não detalhe visual.

---

## 9. Três oportunidades fora do prompt, por ordem de impacto

1. **Páginas por curso (`/curso/<slug>`).** 121 cursos sem URL própria = zero tráfego orgânico. Geradas no `sincronizar.mjs` a partir de `cursos.js`, custam pouco e resolvem SEO + item 15 do prompt de uma vez.
2. **Conteúdo dos 109 cursos genéricos.** O README já admite que converte menos. Nenhum dashboard conserta um modal que não convence. O ranking da Fase 3 diz exatamente por quais começar.
3. **Registrar o re-cadastro (`lead_reengaged`).** Hoje o índice único descarta em silêncio a pessoa que volta — que é o lead mais quente que existe.
