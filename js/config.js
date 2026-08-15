/* GERADO POR sincronizar.mjs — NÃO EDITE ESTE ARQUIVO.
   Edite compartilhado/config.js e rode: node sincronizar.mjs */

/* ============================================================
   CONFIG — único arquivo que você precisa editar para publicar.
   ============================================================ */

/* WhatsApp que recebe os leads (só números, com 55 na frente) */
export const WA_NUMBER = "5598985843807";

/* Supabase — pegue em: Project Settings > API
   A "anon key" é PÚBLICA por natureza (fica visível no navegador).
   Quem protege os dados é a RLS do arquivo sql/schema.sql.
   NUNCA cole aqui a service_role key.                          */
export const SUPABASE_URL      = "https://SEU-PROJETO.supabase.co";
export const SUPABASE_ANON_KEY = "COLE_AQUI_SUA_ANON_KEY";

/* Se ainda não configurou o Supabase, o site continua funcionando:
   o lead é guardado no navegador e a pessoa segue para o WhatsApp. */
export const SUPABASE_OK =
  SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("SEU-PROJETO");

export const CIDADES = ["Barreirinhas", "Tutóia", "Paulino Neves", "Outra cidade"];
