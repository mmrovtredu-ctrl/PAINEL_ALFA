/* ------------------------------------------------------------------
   gerar-seed-cursos.mjs
   Lê compartilhado/cursos.js e emite sql/002b_seed_catalogo.sql —
   um UPSERT idempotente de course_areas + courses.

   Uso:  node scripts/gerar-seed-cursos.mjs
   Rode sempre que o catálogo mudar, e aplique o SQL gerado no Supabase.
   A fonte da verdade continua sendo cursos.js. O banco é espelho.
------------------------------------------------------------------ */
import { writeFileSync } from "node:fs";
import { AREAS, CURSOS } from "../compartilhado/cursos.js";

const q = (v) =>
  v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`;
const qJson = (v) => `'${JSON.stringify(v ?? {}).replace(/'/g, "''")}'::jsonb`;
const qBool = (v) => (v ? "true" : "false");

const linhas = [];
linhas.push("-- GERADO POR scripts/gerar-seed-cursos.mjs — não edite à mão.");
linhas.push(`-- ${AREAS.length} áreas · ${CURSOS.length} cursos`);
linhas.push("begin;\n");

linhas.push("insert into course_areas (slug, nome, tag, icone, ordem) values");
linhas.push(
  AREAS.map((a, i) => `  (${q(a.id)}, ${q(a.nome)}, ${q(a.tag)}, ${q(a.icone)}, ${i})`).join(",\n") +
  "\non conflict (slug) do update set" +
  "\n  nome = excluded.nome, tag = excluded.tag, icone = excluded.icone," +
  "\n  ordem = excluded.ordem, updated_at = now();\n"
);

linhas.push(
  "insert into courses (slug, nome, area_slug, modalidade, cidade, carga, preco,\n" +
  "                     curado, destaque, novo, professor, ativo) values"
);
linhas.push(
  CURSOS.map((c) =>
    `  (${q(c.slug)}, ${q(c.nome)}, ${q(c.area)}, ${q(c.modalidade)}, ${q(c.cidade)}, ` +
    `${q(c.carga)}, ${qJson(c.preco)}, ${qBool(c.curado)}, ${qBool(c.destaque)}, ` +
    `${qBool(c.novo)}, ${q(c.professor)}, true)`
  ).join(",\n") +
  "\non conflict (slug) do update set" +
  "\n  nome = excluded.nome, area_slug = excluded.area_slug," +
  "\n  modalidade = excluded.modalidade, cidade = excluded.cidade," +
  "\n  carga = excluded.carga, preco = excluded.preco, curado = excluded.curado," +
  "\n  destaque = excluded.destaque, novo = excluded.novo," +
  "\n  professor = excluded.professor, ativo = true, updated_at = now();\n"
);

/* curso que saiu do catálogo vira inativo — nunca é apagado,
   senão o histórico de eventos perde a referência. */
linhas.push(
  "update courses set ativo = false, updated_at = now()\n" +
  " where ativo and slug not in (" +
  CURSOS.map((c) => q(c.slug)).join(", ") +
  ");\n"
);

/* liga o que já existe */
linhas.push("update leads l set course_id = c.id from courses c");
linhas.push(" where l.course_id is null and l.curso_slug = c.slug;\n");
linhas.push("update matriculas m set course_id = c.id from courses c");
linhas.push(" where m.course_id is null and m.curso_slug = c.slug;\n");
linhas.push("commit;");

writeFileSync(new URL("../sql/002b_seed_catalogo.sql", import.meta.url), linhas.join("\n") + "\n");
console.log(`sql/002b_seed_catalogo.sql gerado — ${AREAS.length} áreas, ${CURSOS.length} cursos.`);
