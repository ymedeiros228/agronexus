-- O Supabase ainda dá por padrão TRUNCATE, REFERENCES e TRIGGER a quem está logado nas tabelas
-- novas, mesmo com "expor tabelas novas" desligado. TRUNCATE apaga a tabela inteira e não passa
-- pela RLS. A API não oferece esse comando, mas ninguém de fora precisa dessas permissões.
-- Achado na conferência do projeto agronexus em 28/10/2026.

revoke truncate, references, trigger on public.contas, public.membros, public.registros from anon, authenticated;
