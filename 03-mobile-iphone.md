# Painel no iPhone — especificação de uso móvel

O painel vai ser usado principalmente no celular, no iPhone, muitas vezes com uma mão só e no meio do atendimento. Isso não é "responsividade" — é o formato principal. Desktop é o caso secundário.

Este documento é a regra. Onde ele conflitar com "faça um painel bonito de SaaS", ele ganha.

---

## 1. Navegação: tab bar embaixo, não sidebar

Sidebar é padrão de desktop. No iPhone, o polegar alcança a parte de baixo da tela — não o canto superior esquerdo.

```
┌─────────────────────────┐
│  ●●●   Instituto Alfa   │  ← header enxuto, 44 pt, título + período
├─────────────────────────┤
│                         │
│      conteúdo           │
│      (scroll)           │
│                         │
├─────────────────────────┤
│  📊     👥     🔥    ⋯  │  ← tab bar fixa, 5 itens no máximo
│ Hoje  Leads  CRM   Mais │     + env(safe-area-inset-bottom)
└─────────────────────────┘
```

- **Máximo 5 abas.** Hoje · Leads · CRM · Follow-ups · Mais.
- "Mais" abre uma folha com Analytics, Cursos, Recuperação, Relatórios, Configurações.
- No desktop (≥ 1024 px), a mesma navegação vira sidebar. Um só componente, dois layouts.
- A aba ativa precisa ser óbvia sem depender de cor sozinha (ícone preenchido vs. contornado).

---

## 2. As regras do Safari do iPhone que quebram tudo

Estas não são detalhes. Cada uma delas produz um bug visível.

| Problema | Regra |
|---|---|
| `100vh` corta o conteúdo atrás da barra do Safari | Use `100dvh`. Nunca `100vh` em tela cheia |
| O input dá zoom sozinho ao receber foco | **Todo `input`, `select` e `textarea` com `font-size: 16px` no mínimo.** Sem exceção |
| Notch, Dynamic Island e barra de gestos cobrem a UI | `viewport-fit=cover` + `padding: env(safe-area-inset-*)` no header e na tab bar |
| A página inteira "borrachuda" ao arrastar | `overscroll-behavior-y: contain` no container de scroll |
| Flash cinza ao tocar em qualquer coisa | `-webkit-tap-highlight-color: transparent` + estado `:active` próprio |
| Alvo pequeno demais para o polegar | **Mínimo 44 × 44 pt** em tudo que é tocável (padrão da Apple) |
| `:hover` fica "grudado" depois do toque | Nada de informação exclusiva de hover. Tooltip vira toque |
| Teclado cobre o campo em foco | `scrollIntoView({ block: 'center' })` no `focus`, e formulários em folha, não em modal centralizado |
| Modo privado quebra `localStorage` | Todo acesso a `localStorage` dentro de `try/catch` |
| A conexão cai no meio do atendimento | Estado offline explícito + fila de ações. Nunca perder o que foi digitado |

```html
<meta name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover">
```

```css
:root {
  --safe-top:    env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}
.tabbar { padding-bottom: calc(8px + var(--safe-bottom)); }
.app    { min-height: 100dvh; overscroll-behavior-y: contain; }
input, select, textarea { font-size: 16px; }
```

---

## 3. Tabela não existe no celular. Vira cartão.

Nenhuma tabela horizontal com scroll lateral. Nunca. No iPhone, cada linha vira um cartão com hierarquia própria:

```
┌────────────────────────────────────┐
│ 🔥  Maria Silva            há 2 h  │
│     Massoterapia VIP               │
│     Instagram · Tutóia             │
│     ┌──────────┐  ┌─────────────┐  │
│     │ WhatsApp │  │  Em atend.▾ │  │
│     └──────────┘  └─────────────┘  │
└────────────────────────────────────┘
```

- Nome, temperatura e tempo na primeira linha — é o que decide se vale abrir.
- Duas ações no cartão, no máximo: **WhatsApp** e **mudar status**. O resto está dentro.
- Deslizar para a esquerda revela ações rápidas (ligar, adiar, arquivar) — padrão que o usuário de iPhone já conhece do Mail.
- Rolagem infinita com `IntersectionObserver`, 20 por vez. Nada de paginação numerada no celular.
- A mesma lista, em ≥ 1024 px, vira tabela de verdade. Dois componentes, uma fonte de dados.

---

## 4. Kanban: arrastar no toque é ruim

Arrastar um cartão entre colunas com o dedo, numa tela de 390 px, com scroll horizontal e vertical competindo, é frustrante. Duas superfícies diferentes:

**No iPhone** — o Kanban vira um seletor de etapa:

- Chips horizontais no topo: `Novos (12) · Atendendo (5) · Proposta (3) · …`
- Tocar num chip filtra a lista abaixo.
- Mudar a etapa de um lead: tocar no cartão → folha inferior com as etapas → toque → pronto. Dois toques, sem arrastar.
- Deslizar o cartão para a direita avança uma etapa (com desfazer no toast).

**No desktop** — Kanban com drag-and-drop de verdade (dnd-kit), colunas lado a lado.

Se, mesmo assim, houver arrasto no celular, use `PointerSensor` com `activationConstraint: { delay: 200, tolerance: 8 }` — sem isso, o arrasto rouba o scroll.

---

## 5. Folhas inferiores no lugar de modais

Toda interação secundária — mudar status, criar follow-up, ver notas, filtrar, criar matrícula — abre como **bottom sheet**, não como caixa centralizada:

- Sobe de baixo, ocupa no máximo 90 % da altura.
- Alça de arrastar no topo; arrastar para baixo fecha.
- Botão de ação fixo no rodapé da folha, acima da safe area.
- Formulário longo rola dentro da folha, com o botão sempre visível.

Motivo: o polegar alcança o rodapé; não alcança o centro-superior de um iPhone 15 Pro Max.

---

## 6. Gráficos que funcionam no toque

- Nada de tooltip por hover. **Toque e arraste** ao longo do gráfico mostram o valor.
- Máximo 3 séries por gráfico no celular. Mais que isso vira ruído em 390 px.
- Gráfico de barras de 30 dias no iPhone: mostrar 14 dias e permitir deslizar, ou agregar por semana.
- Eixo com no máximo 4 marcas.
- O funil vira empilhado na vertical, com número absoluto e taxa entre etapas — não em formato de funil desenhado, que fica ilegível estreito.
- Recharts com `ResponsiveContainer`; testar em 390 × 844 (iPhone 15) e 375 × 667 (iPhone SE).

---

## 7. Tela "Hoje" — a única que importa às 9 da manhã

Abrir o painel no celular tem que responder três perguntas em um scroll:

```
1. Com quem eu falo AGORA
   → Follow-ups de hoje + leads quentes sem atendimento
   → cada item com botão de WhatsApp direto

2. O que aconteceu desde ontem
   → leads novos, cliques no WhatsApp, matrículas

3. O que está queimando
   → propostas sem resposta há 3+ dias
   → contas vencendo
```

Números grandes, poucos. Um cartão por pergunta. Tudo o mais fica nas outras abas.

---

## 8. Instalável na tela de início (PWA)

Não é enfeite: instalado, o painel abre em tela cheia, sem a barra do Safari, e parece um app.

- `manifest.webmanifest` com `display: "standalone"`, `theme_color`, `background_color`, ícones 192/512.
- `apple-touch-icon` 180 × 180 (o iOS ignora o manifest para o ícone).
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`.
- Service worker mínimo: cache do shell (HTML, CSS, JS) e tela offline honesta. **Nada de cachear dados de lead** — informação velha de CRM é pior que nenhuma.
- Um aviso discreto, uma vez só, ensinando "Compartilhar → Adicionar à Tela de Início". O iOS não tem prompt automático de instalação.

---

## 9. WhatsApp: o painel tem que sair do caminho

No iPhone, tocar em `https://wa.me/55...` abre o app do WhatsApp direto. É o gesto mais usado do painel inteiro.

- Botão de WhatsApp visível **sem abrir o lead** — no cartão da lista.
- Mensagem já pronta, com o primeiro nome e o curso.
- Ao voltar do WhatsApp para o painel (evento `visibilitychange`), perguntar em uma folha: *"Falou com a Maria? O que aconteceu?"* → Atendido · Proposta enviada · Sem resposta · Fechou. Um toque atualiza o CRM.
- Isso resolve o maior problema operacional do sistema: o status só é atualizado se atualizar for mais fácil do que não atualizar.

---

## 10. Performance no 4G do interior do Maranhão

O público está em Barreirinhas, Tutóia e Paulino Neves. Não presuma fibra.

- Orçamento: **< 200 KB de JavaScript** na primeira tela do painel.
- Nada de biblioteca de gráfico carregada antes de existir gráfico na tela — `dynamic(() => import(...), { ssr: false })`.
- Skeleton em todo carregamento acima de 300 ms.
- Otimista em toda mudança de status: muda na hora, reverte com toast se falhar.
- Fonte do sistema (`-apple-system`) em vez de webfont — economiza o request e já parece nativo no iPhone.
- Lighthouse mobile ≥ 90, com throttling de 4G.

---

## 11. Imersivo, sem virar enfeite

"Imersivo" aqui significa: ocupa a tela toda, responde ao toque na hora, e não parece um site espremido.

- Tema escuro por padrão (o painel atual já é escuro, e é o que se usa de noite fechando venda), respeitando `prefers-color-scheme`.
- `theme-color` casando com o header, para a barra de status do iPhone fundir com o app.
- Transições curtas: 150–200 ms. Nada acima de 300 ms — parece lento.
- Respeitar `prefers-reduced-motion`: sem animação, tudo continua funcionando.
- Toast no rodapé, acima da tab bar, com ação de **desfazer** em toda mudança destrutiva.
- Pull-to-refresh na tela "Hoje", com resistência elástica.
- Estado vazio com uma frase humana e um botão, nunca uma tabela em branco.

---

## 12. Checklist de aceite (rodar em iPhone de verdade, não só no simulador)

- [ ] Nenhum campo dá zoom ao receber foco
- [ ] Nada fica escondido atrás da Dynamic Island ou da barra de gestos
- [ ] Toda ação principal é alcançável com o polegar de uma mão só
- [ ] Nenhum scroll horizontal em nenhuma tela
- [ ] Mudar o status de um lead: no máximo 2 toques
- [ ] Abrir o WhatsApp de um lead: 1 toque a partir da lista
- [ ] Funciona instalado na tela de início, em tela cheia
- [ ] Funciona em 4G lento — skeleton aparece em menos de 1 s
- [ ] Sem conexão, avisa e não perde nada que foi digitado
- [ ] Testado em iPhone SE (375 px) e em iPhone Pro Max (430 px)
- [ ] Testado com o modo escuro e o claro do sistema
- [ ] Testado com o texto do sistema aumentado (Ajustes → Tela → Texto maior)
