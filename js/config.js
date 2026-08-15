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
export const SUPABASE_URL      = "https://moxffkuqvblscmeoolrr.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1veGZma3VxdmJsc2NtZW9vbHJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MDEzMzIsImV4cCI6MjEwMjM3NzMzMn0.bO4eODeBWpn7AFiq82IL2h3-h40sqzbnOWm-U4Ysp48";  // cole aqui o que copiou

/* Se ainda não configurou o Supabase, o site continua funcionando:
   o lead é guardado no navegador e a pessoa segue para o WhatsApp. */
export const SUPABASE_OK =
  SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("SEU-PROJETO");

export const CIDADES = ["Barreirinhas", "Tutóia", "Paulino Neves", "Outra cidade"];
