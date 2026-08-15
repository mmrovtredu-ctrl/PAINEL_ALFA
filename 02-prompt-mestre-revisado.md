# Prompt mestre revisado (v2) — Analytics + CRM móvel · Instituto Alfa

> **v2:** incorpora a leitura do repositório `PAINEL_ALFA` e a decisão de que o painel é, antes de tudo, **um app de iPhone**.
>
> **Como usar:** abra o monorepo no Claude Code ou Cursor e cole a seção **CONTEXTO** + a **FASE** que você quer executar. Uma fase por vez. Colar o documento inteiro de uma vez piora o resultado.
>
> Vêm junto, prontos para usar: `sql/002_catalogo.sql`, `scripts/gerar-seed-cursos.mjs`, `sql/002b_seed_catalogo.sql` (121 cursos já gerados), `sql/003_tracking.sql`, `site/tracker.js` e `painel/app/api/track/route.ts`.

---

## CONTEXTO (cole isto no começo de toda conversa nova)

```
Você está trabalhando no projeto Instituto Alfa. Antes de qualquer coisa, leia o
código. O que segue é o que eu já verifiquei nos dois repositórios — confirme,
não presuma.

ONDE O CÓDIGO MORA
- Repo do site:   institutoalfa      → index.html, js/script.js, css/styles.css
- Repo do painel: PAINEL_ALFA        → index.html, js/painel.js, css/painel.css
- Fonte comum:    compartilhado/     → config.js, db.js, cursos.js
  sincronizar.mjs copia compartilhado/ para js/ nos DOIS repos.
  Esses arquivos abrem com "GERADO POR sincronizar.mjs — NÃO EDITE".
  js/painel.js e js/script.js NÃO são gerados: são fonte, cada um no seu repo.
  sql/schema.sql existe (o README cita) mas não está em nenhum dos dois repos —
  localize-o antes da Fase 0.

STACK
- Site e painel: HTML/CSS/JS puro, ES Modules nativos, SEM build, sem TypeScript.
- Banco: Supabase (moxffkuqvblscmeoolrr). O browser fala direto com o Postgres.
  Não existe backend.
- Auth: Supabase Auth e-mail/senha (signInWithPassword). Cadastro público off.
- Analytics: NENHUM. Sem GA, sem Pixel, sem tabela de eventos.

CATÁLOGO
- 121 cursos (NÃO 1.212), em compartilhado/cursos.js, array CURSOS. 9 áreas.
- 112 EAD, 9 presenciais. 109 têm curado:false (descrição genérica de área).
- Campos: slug, nome, area, modalidade, cidade, carga, destaque, novo, professor,
  turma, video, poster, resumo, sobre, conteudo[], publico, saidas[],
  beneficios[], preco{}, curado, foto, turnos, idade_min, combo.

BANCO HOJE (colunas confirmadas no código)
- leads: id, created_at, nome, email, telefone, idade, cidade, curso, curso_slug,
  area, modalidade, origem, utm_source, utm_medium, utm_campaign, status,
  observacoes, contatado_em, responsavel.
  → curso_slug JÁ EXISTE e já é gravado. É a chave estável de curso.
  → índice único (telefone, curso_slug): o mesmo número não duplica no mesmo curso.
- matriculas: id, created_at, lead_id, aluno_nome, aluno_telefone, aluno_email,
  curso, curso_slug, modalidade, cidade, valor_matricula, valor_mensalidade,
  parcelas, dia_vencimento, data_inicio, status (ativa|cancelada), observacoes.
  → matriculas.lead_id JÁ EXISTE: o vínculo lead→venda já é possível hoje.
  → As parcelas são geradas por TRIGGER no banco, não pelo JS. Não recrie isso.
- lancamentos: vencimento, descricao, tipo(entrada|saida), valor, categoria,
  matricula_id, pago_em, responsavel, status (pago|pendente|cancelado).
- v_financeiro: view com status_efetivo (pago | pendente | atrasado).
- Status de lead, array hardcoded na linha ~215 de painel.js:
  ["novo","contatado","negociacao","matriculado","perdido"]
- RLS: anônimo pode INSERT em leads; SELECT exige login.
- Dados reais no banco hoje: ZERO linhas.

DEFEITOS CONHECIDOS (não invente outros, comece por estes)
1. carregarTudo() faz select("*") com limit 2000/2000/5000 e agrega TUDO no
   browser. Passando disso, o dashboard subnotifica em silêncio — sem aviso.
2. O ranking de cursos agrupa por l.curso (texto), não por curso_slug. Qualquer
   diferença de grafia vira duas linhas.
3. Quando alguém se recadastra no mesmo curso, o insert devolve 23505 e o
   sistema trata como sucesso silencioso. O lead mais quente que existe some.
4. Nenhum filtro é server-side. Busca, status e período rodam sobre o array.

FLUXO DO WHATSAPP
Todos os botões .wa do site são interceptados por bindCTAs() e abrem o
FORMULÁRIO, não o WhatsApp. O wa.me só abre depois do submit, com o lead já
gravado. Ou seja: hoje "clicar no WhatsApp" e "virar lead" são o MESMO evento.
Número único para os 121 cursos: WA_NUMBER = "5598985843807".

DECISÕES DE ARQUITETURA JÁ TOMADAS — não reabra
- O site público CONTINUA estático e vanilla. Ganha tracker e páginas por curso.
  NÃO é reescrito em React.
- SÓ O PAINEL migra para Next.js 15 (App Router) + TypeScript + Tailwind +
  shadcn/ui, no mesmo Supabase.
- Eventos NUNCA são escritos direto do browser. Sempre via /api/track.
- O dashboard NUNCA lê a tabela events direto. Lê rollups diários.

>>> O PAINEL É UM APP DE IPHONE <<<
Ele vai ser usado no celular, com uma mão só, no meio do atendimento. Mobile não
é "versão responsiva": é o formato principal. Desktop é o caso secundário.
Regras que valem em TODA fase:
- Navegação por tab bar no rodapé (máx. 5 itens), respeitando
  env(safe-area-inset-bottom). Sidebar só a partir de 1024 px.
- 100dvh, nunca 100vh. viewport-fit=cover. Safe areas em header e rodapé.
- Todo input/select/textarea com font-size >= 16px (senão o Safari dá zoom).
- Alvo de toque mínimo 44x44 pt. Nada depende de :hover.
- Tabela vira CARTÃO no celular. Zero scroll horizontal, em qualquer tela.
- Interação secundária abre em bottom sheet, não em modal centralizado.
- Kanban com arrastar só no desktop; no iPhone, chips de etapa + folha de status.
- Menos de 200 KB de JS na primeira tela. Público em 4G do interior do Maranhão.
- Detalhes completos e checklist de aceite: ver 03-mobile-iphone.md.

COMO EU QUERO QUE VOCÊ TRABALHE
1. Leia o código antes de propor. Se algo acima não bater com o repositório,
   PARE e me avise — não siga com a suposição errada.
2. Antes de cada fase, mostre: o que muda no banco, quais arquivos são criados
   ou alterados, e por quê. Espere meu OK.
3. Não quebre o que funciona: fila offline, honeypot, trava de 2,5 s,
   degradação sem anime.js, trigger de geração de parcelas.
4. Migrações SQL idempotentes e reversíveis. Nunca DROP sem eu pedir.
5. Não invente dados. Nada de número mockado em tela de produção.
6. Não adicione biblioteca sem justificar em uma linha.
7. Português do Brasil na interface e nos comentários.
8. No fim de cada fase: o que foi feito, como eu testo NO IPHONE, o que ficou
   pendente.
```

---

## FASE 0 — Fundação: catálogo no banco e RLS auditada

**Objetivo:** dar ao banco uma chave estável de curso. Sem isso, nenhum ranking existe.

> Arquivos prontos: `sql/002_catalogo.sql` e `scripts/gerar-seed-cursos.mjs`.

```
1. Localize sql/schema.sql e o sincronizar.mjs. Confirme a estrutura real e me
   diga se ela difere do que descrevi no CONTEXTO.
2. Confirme o tipo de leads.id e matriculas.id (bigint ou uuid) e ajuste os
   arquivos SQL se for uuid.
3. Aplique sql/002_catalogo.sql:
   - course_areas (slug PK, nome, tag, icone, ordem)
   - courses (id, slug UNIQUE, nome, area_slug, modalidade, cidade, carga,
     preco jsonb, curado, destaque, novo, professor, ativo)
   - leads.course_id e matriculas.course_id, com trigger que preenche a partir
     de curso_slug
   - MANTÉM curso e curso_slug. Nada é removido.
4. Rode node scripts/gerar-seed-cursos.mjs e aplique sql/002b_seed_catalogo.sql.
   Curso que sai do catálogo vira ativo=false — NUNCA é apagado, senão o
   histórico de eventos perde a referência.
   Integre o script ao sincronizar.mjs.
5. Corrija o defeito 2: o ranking de cursos passa a agrupar por course_id.
6. Audite as policies de RLS de TODAS as tabelas e me entregue uma tabela:
   quem lê, quem escreve, o que falta. NÃO altere ainda — só reporte.

Aceite: select count(*) from courses = 121; count(*) from course_areas = 9;
nenhum lead com curso_slug preenchido e course_id nulo; o seed roda duas vezes
seguidas sem efeito colateral.
```

---

## FASE 1 — Tracking (a fase que não pode esperar)

**Objetivo:** começar a coletar hoje. Cada dia sem tracking é um dia de dados que não voltam.

> Arquivos prontos: `sql/003_tracking.sql`, `site/tracker.js`, `painel/app/api/track/route.ts`.

```
1. Aplique sql/003_tracking.sql: visitors, sessions, events (particionada por
   mês, append-only), whatsapp_clicks, os três rollups e fn_atualizar_rollups.
   Habilite pg_cron e agende: rollups a cada 15 min, criação de partição no
   dia 1 de cada mês.

2. Instale compartilhado/tracker.js (o arquivo entregue) e sincronize para os
   dois repos. Ajuste ENDPOINT para a URL do painel.
   Ele já cuida do que quebra no iPhone: sendBeacon em visibilitychange e
   pagehide (beforeunload não é confiável no iOS), localStorage em try/catch
   (modo privado do Safari), Do Not Track e Global Privacy Control.

3. Instrumente o site — os eventos entram em js/script.js:
   page_view · course_view · course_time · course_search (com debounce) ·
   course_click · form_opened · whatsapp_click · lead_created · lead_reengaged

   Corrija o defeito 3 no mesmo passo: quando salvarLead() receber 23505,
   dispare lead_reengaged em vez de tratar como sucesso silencioso.

4. Suba /api/track (o route.ts entregue) no app do painel. Confirme:
   valida com zod, enriquece device/OS/browser pelo User-Agent no servidor,
   região pelos headers da Vercel, NUNCA grava IP, rate limit por visitor_id,
   escreve com service_role. Ajuste o Access-Control-Allow-Origin.
   A service_role key vai em variável de ambiente. Nunca no bundle.

5. Botão "Falar direto no WhatsApp" no modal do curso, ao lado do formulário:
   - novoClickRef() gera um código de 6 caracteres (ex.: A7K2QX)
   - dispara whatsapp_click com o código
   - embute na mensagem: "Código do atendimento: A7K2QX"
   É isso que liga navegação → conversa → venda. Sem o código, o funil é chute.
   No iPhone, esse botão precisa ter no mínimo 44 pt de altura e ficar acima
   da dobra dentro do modal.

6. Páginas por curso: sincronizar.mjs passa a gerar /curso/<slug>.html a partir
   de cursos.js — title, meta description, canonical, Open Graph e JSON-LD
   (schema.org/Course). 121 páginas estáticas.
   Motivo duplo: hoje os 121 cursos não recebem uma visita orgânica do Google,
   e "páginas mais acessadas" não tem o que medir com uma página só.

Aceite: navegar no site pelo Safari do iPhone gera linhas em events; o cron
popula os rollups; o site continua funcionando com /api/track fora do ar e
com bloqueador de rastreio ligado.
```

---

## FASE 2 — Painel Next.js, desenhado para o iPhone

```
1. App Next.js 15 (App Router, TypeScript, Tailwind, shadcn/ui). Auth Supabase
   com middleware protegendo tudo. O painel.html antigo fica no ar até a
   paridade estar completa.

2. Shell móvel:
   - Tab bar no rodapé, 5 itens: Hoje · Leads · CRM · Follow-ups · Mais.
     "Mais" abre folha com Analytics, Cursos, Recuperação, Relatórios, Config.
   - Header de 44 pt: título + seletor de período. Nada mais.
   - Em >= 1024 px, a mesma navegação vira sidebar. Um componente, dois layouts.
   - viewport-fit=cover, safe areas, 100dvh, overscroll-behavior contain,
     -webkit-tap-highlight-color transparent.

3. PWA: manifest standalone, apple-touch-icon 180x180, status bar
   black-translucent, service worker que cacheia só o shell — NUNCA dados de
   lead. Aviso único ensinando "Compartilhar → Adicionar à Tela de Início".

4. Seletor de período (hoje · ontem · 7 d · 30 d · este mês · mês anterior ·
   personalizado), persistido na URL, aberto em bottom sheet no celular.

5. Tela "Hoje" (a home do celular) responde três perguntas em um scroll:
   a) com quem falo agora — follow-ups de hoje + leads quentes sem atendimento,
      cada um com botão de WhatsApp direto
   b) o que aconteceu desde ontem — leads novos, cliques, matrículas
   c) o que está queimando — propostas sem resposta há 3+ dias, contas vencendo
   Números grandes, poucos. Um cartão por pergunta.

6. Dashboard completo (aba "Mais"), lendo APENAS os rollups:
   Cards: visitantes · views de curso · cliques no WhatsApp · leads · em
   atendimento · matrículas · perdidos · taxa de conversão · receita
   (de v_financeiro) · oportunidade potencial perdida. Cada um comparado com o
   período anterior.
   Gráficos: visitantes/dia · leads/dia · matrículas/dia · funil.
   Funil VISITANTE → VIU CURSO → CLICOU WHATSAPP → LEAD → ATENDIMENTO →
   PROPOSTA → MATRÍCULA, empilhado na vertical no celular, com número e taxa
   entre etapas.
   No celular: máx. 3 séries por gráfico, tooltip por toque e arraste (nunca
   hover), 14 dias visíveis com deslize, eixo com no máx. 4 marcas.
   Recharts carregado com dynamic import, ssr false.

7. Estados: skeleton acima de 300 ms, vazio honesto ("a coleta começou em
   <data>"), erro com botão de tentar de novo, offline explícito. Nunca
   renderize zero como se fosse dado.

Aceite: nenhum número vem de mock; nenhuma query lê events direto; Lighthouse
MOBILE >= 90 com throttling de 4G; nenhum scroll horizontal em 375 px.
```

---

## FASE 3 — Analytics dos cursos

```
Página com 4 rankings, paginados e filtráveis por área, modalidade e período.
No celular: um seletor de ranking no topo (chips) e lista de cartões abaixo —
não quatro tabelas empilhadas.

1. Mais visitados      — views, visitantes únicos, tempo médio, cliques WA
2. Que mais geram lead — views, cliques, leads, taxa
3. Que mais matriculam — leads, matrículas, taxa, receita
4. Alto interesse, baixa conversão   ← a mais importante
   Regra: views acima do percentil 75 E taxa (lead→matrícula) abaixo da metade
   da mediana geral. Volume mínimo de 30 views, senão curso com 3 acessos vira
   alarme falso. Badge: "⚠️ Alto interesse, baixa conversão".

Cruze com o campo curado: se o curso da lista 4 tem curado:false, mostre
"descrição genérica" ao lado — 109 dos 121 estão nessa situação. Isso
transforma o alerta em ação concreta.

Aceite: os rankings batem com conferência manual em SQL; nada de N+1;
agrupamento por course_id, nunca por texto.
```

---

## FASE 4 — Leads completos e timeline

```
1. leads ganha: responsavel_id, ultimo_contato_em (visitor_id, click_ref,
   session_id, valor_proposta, valor_venda e proximo_contato_em já vêm do 003).
2. Vínculo do atendimento: o vendedor cola o click_ref recebido no WhatsApp e o
   lead herda o visitor_id — com ele, todo o histórico de navegação.
   No celular isso é uma folha com campo de 6 caracteres, teclado em maiúsculas,
   e leitura da área de transferência sugerida.
3. Lista de leads com filtro, busca e paginação SERVER-SIDE. Corrige o defeito 1
   e o 4: acaba o select("*") com limite silencioso.
   No celular: cartões com nome, temperatura, curso, tempo; deslizar para a
   esquerda revela ações; rolagem infinita de 20 em 20.
4. Página do lead:
   - Informações · Interesse (curso principal + outros vistos) · Comportamento
     (visitas, cursos, cliques, último acesso, tempo)
   - Timeline unindo events + lead_history + followups + proposals, cronológica
5. Botão de WhatsApp no cartão da lista, sem precisar abrir o lead. Ao voltar do
   WhatsApp (visibilitychange), abrir folha: "Falou com a Maria? O que
   aconteceu?" → Atendido · Proposta enviada · Sem resposta · Fechou.
   Um toque atualiza o CRM. É isso que faz o status ser mantido de verdade.

Aceite: lista com 50 mil leads abre em menos de 1 s; a timeline mostra
navegação anterior à criação do lead quando há click_ref vinculado; mudar o
status leva no máximo 2 toques no iPhone.
```

---

## FASE 5 — CRM / Kanban

```
1. lead_statuses (chave, rotulo, ordem, cor, is_ganho, is_perdido), populada com
   os 5 status atuais + PROPOSTA ENVIADA, AGUARDANDO RESPOSTA, SEM RESPOSTA.
   Remova o array hardcoded de painel.js.
2. Desktop: Kanban com dnd-kit, colunas de lead_statuses, update otimista com
   rollback. PointerSensor com activationConstraint delay 200 / tolerance 8.
3. iPhone: NÃO é arrastar. Chips horizontais de etapa com contagem no topo,
   lista de cartões abaixo. Trocar etapa = tocar no cartão → folha com as
   etapas → toque. Deslizar para a direita avança uma etapa, com desfazer.
4. lead_history por TRIGGER no banco, não pela aplicação — histórico não pode
   depender da UI.
5. Cartão: nome, curso, temperatura, tempo parado na etapa, responsável.

Aceite: arrastar no desktop e trocar pela folha no celular gravam o mesmo
histórico; mudar status por fora da UI também grava; a migração converte os
status existentes sem perder nada.
```

---

## FASE 6 — Lead Score

```
1. score_rules (chave, pontos, ativo), valores iniciais:
   visitou_curso +5 · revisitou_mesmo_curso +10 · clicou_whatsapp +15 ·
   visitou_varios_cursos +10 · retornou_ao_site +20 · recebeu_proposta +20 ·
   intencao_de_compra +30
2. Função no banco que recalcula a partir de events + lead_history. Cron e sob
   demanda. Teto em 100.
3. lead_scores (lead_id, score, temperatura, calculado_em):
   0–30 FRIO 🔵 · 31–60 MORNO 🟡 · 61–80 QUENTE 🟠 · 81–100 MUITO QUENTE 🔥
   No cartão, a temperatura é o primeiro elemento — é o que decide se abre.
4. Tela de configuração das regras, com prévia do impacto antes de salvar.

Aceite: mudar uma regra e recalcular produz score coerente; lead sem visitor_id
vinculado não quebra o cálculo (score parcial, sinalizado como tal).
```

---

## FASE 7 — Follow-ups

```
1. followups (lead_id, responsavel_id, data_hora, prioridade, observacao,
   concluido_em).
2. "Follow-ups de hoje" é aba própria na tab bar. Agrupada por prioridade, com
   temperatura, curso, último contato e WhatsApp em um toque.
3. Atrasados no topo, destacados.
4. Ao concluir, pede o próximo passo — nenhum lead fica sem próxima ação.
5. Badge com a contagem do dia no ícone da tab bar.

Aceite: VENDEDOR só enxerga os próprios follow-ups, via RLS — não por filtro
na UI.
```

---

## FASE 8 — Recuperação de leads

```
7 segmentos, cada um uma query nomeada, filtrável e exportável:
1. Não fecharam nos últimos 7 / 15 / 30 dias
2. Receberam proposta e não responderam
3. Clicaram no WhatsApp e não viraram lead (whatsapp_clicks com lead_id nulo)
4. Visitam o mesmo curso repetidamente e não se cadastraram
5. Leads quentes (score > 60) sem matrícula
6. Sem nenhum contato há mais de X dias
7. Re-cadastros (lead_reengaged) sem atendimento

Cada segmento mostra a oportunidade em R$: nº de leads × ticket médio
configurável, ou a soma dos valor_proposta reais quando existirem.
Ação em massa: atribuir responsável e criar follow-up para o segmento inteiro.
No celular: lista de segmentos com contagem e valor; tocar abre a lista.
```

---

## FASE 9 — Relatórios, alertas e busca

```
1. Relatórios: curso · vendedor · conversão · origem · matrículas · perdidos ·
   recuperação · campanhas · comportamento. CSV e XLSX. Exportação pesada roda
   em background. No celular, o relatório é resumo + botão de enviar por
   WhatsApp/e-mail — planilha não se lê no iPhone.

2. Alertas na tela "Hoje", cada um com regra explícita e link para a lista:
   - "🔥 N leads muito quentes sem atendimento há mais de 24 h"
   - "⚠️ <curso> teve N acessos e apenas M matrículas"
   - "📈 <origem> gerou X% mais leads que na semana anterior"
   - "🚨 N propostas sem resposta há mais de 3 dias"
   - "💰 R$ X em oportunidades recuperáveis"
   Nunca dispare alerta com amostra pequena.

3. Busca global: cursos, leads, telefone, vendedores, campanhas. Full-text no
   Postgres, com debounce. No celular é um campo no topo da aba Leads, não ⌘K.

4. Horários (heatmap dia × hora, de hourly_stats), dispositivos, navegador, SO,
   páginas mais acessadas — que só faz sentido depois das páginas por curso.
   Espere Android e iOS dominarem: dimensione o painel para isso.
```

---

## FASE 10 — Segurança, permissões e performance

```
1. app_users (user_id → auth.users, nome, papel, ativo):
   ADMIN · GERENTE · VENDEDOR · ANALISTA
2. RLS por papel em TODAS as tabelas:
   - VENDEDOR: só os próprios leads e follow-ups; sem financeiro global
   - ANALISTA: analytics e relatórios, SEM telefone e e-mail dos leads
   - GERENTE: tudo menos configurações do sistema e audit log
   - ADMIN: tudo
   Escreva testes que provem cada restrição. RLS não testada é RLS que não existe.
3. audit_log com trigger em leads, matriculas, lancamentos e configurações.
4. Performance: EXPLAIN ANALYZE nas 10 queries mais usadas; particionamento de
   events validado; retenção (detalhe 12 meses, rollup para sempre).
5. LGPD: política, base legal do tracking e caminho de exclusão por
   telefone/e-mail. Não é opcional — o formulário aceita a partir de 10 anos,
   ou seja, o site coleta dados pessoais de menores.
```

---

## Definição de pronto (vale para toda fase)

**Dados**

- Nenhum número em tela vem de mock
- Nenhuma query nova em tabela sem índice adequado
- Nenhum `select('*')` sem filtro e paginação no servidor
- Toda migração roda duas vezes seguidas sem erro
- Agrupamento de curso por `course_id`, nunca por texto

**Não quebrou nada**

- O site público funciona com `/api/track` fora do ar
- Fila offline, honeypot e trava de 2,5 s intactos
- Trigger de geração de parcelas intacto

**iPhone** (testar no aparelho, não só no simulador)

- Nenhum campo dá zoom ao receber foco
- Nada escondido atrás da Dynamic Island ou da barra de gestos
- Toda ação principal alcançável com o polegar, uma mão só
- Zero scroll horizontal em qualquer tela
- Mudar status de um lead: no máximo 2 toques
- Abrir o WhatsApp de um lead: 1 toque a partir da lista
- Funciona instalado na tela de início, em tela cheia
- Skeleton aparece em menos de 1 s no 4G
- Sem conexão: avisa e não perde nada digitado
- Testado em 375 px (SE) e 430 px (Pro Max), tema claro e escuro, e com o
  texto do sistema aumentado
