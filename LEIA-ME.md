# Entrega — Instituto Alfa · Analytics + CRM móvel

```
01-analise-arquitetura.md    análise do que existe hoje + arquitetura proposta (v2)
02-prompt-mestre-revisado.md prompt de execução, fatiado em 11 fases (v2)
03-mobile-iphone.md          especificação de uso no iPhone — a regra de design

sql/002_catalogo.sql         FASE 0 — courses, course_areas, course_id, triggers, RLS
sql/002b_seed_catalogo.sql   FASE 0 — seed dos 121 cursos, já gerado (idempotente)
sql/003_tracking.sql         FASE 1 — visitors, sessions, events, rollups, pg_cron

scripts/gerar-seed-cursos.mjs  regera o 002b a partir de compartilhado/cursos.js
site/tracker.js                FASE 1 — tracker vanilla, pronto para o iPhone
painel/app/api/track/route.ts  FASE 1 — ingestão de eventos no Next.js
```

## Ordem

1. Localize `sincronizar.mjs` e `sql/schema.sql` — não estão em nenhum dos dois repos.
2. Confirme o tipo de `leads.id` (bigint ou uuid) e ajuste `003_tracking.sql`.
3. Aplique `002_catalogo.sql` → rode o gerador → aplique `002b_seed_catalogo.sql`.
4. Aplique `003_tracking.sql`, habilite `pg_cron` e agende os dois jobs (comentados no fim do arquivo).
5. Instale `tracker.js` em `compartilhado/`, ajuste o `ENDPOINT`, sincronize.
6. Suba `/api/track`, ajuste o `Access-Control-Allow-Origin` e a `SUPABASE_SERVICE_ROLE_KEY`.

## Antes de rodar qualquer coisa

Faça backup do banco. As migrações são idempotentes e não removem coluna nenhuma,
mas backup antes de migração não se discute.
