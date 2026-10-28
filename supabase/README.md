# Servidor do AgroNexus (Supabase)

O app funciona sem servidor: tudo fica no aparelho. Com a conta na nuvem ligada, o que é registrado sem sinal sobe sozinho quando o sinal volta e aparece nos outros aparelhos da mesma conta.

## Como funciona
- `migrations/20261028223449_sincronizacao.sql` cria:
  - `contas` e `membros`. Cada pessoa ganha a sua conta no cadastro, como dona. Os papéis `editor` e `leitor` ficam para o convite da Etapa 6.
  - `registros`, uma cópia de cada registro das tabelas do aparelho, em `jsonb`, por conta. Campo novo no app não precisa de migração.
  - `enviar_registros(conta, lote)`, que grava o lote. **Vence a edição mais recente** (`atualizado_em`, o `updatedAt` do aparelho). Responde, registro por registro, se aceitou (com o carimbo do servidor) ou recusou (com a versão que ficou lá).
  - O bucket privado `fotos`, com uma pasta por conta (`<conta_id>/<foto_id>`).
  - As regras de acesso (RLS). Cada pessoa só lê as contas de que é membro, só dono e editor gravam, e o visitante sem login não vê nada.
- No aparelho, o código fica em `apps/web/src/lib/sync/`:
  - `engine.ts` recebe e envia.
  - `cloud.ts` cuida do login e da ligação com a conta.
  - Os ganchos em `db.ts` marcam como pendente tudo o que é gravado.
- A lógica do SQL foi testada em 28/10/2026 num Postgres local (PGlite), com 31 verificações: conflito, reenvio, isolamento entre contas, leitor, visitante e fotos.

## Ligar a nuvem (uma vez)
1. Criar a conta no Supabase **com o e-mail do AgroNexus** e o projeto `agronexus`, na região **South America (São Paulo)**. A região não muda depois.
2. Dar acesso ao Claude Code de uma das duas formas: conectar o plugin do Supabase a essa conta ou rodar `! npx supabase login` no terminal. Ele aplica a migração e confere os avisos de segurança (`get_advisors`).
3. Em **Authentication → URL Configuration**:
   - Site URL: o endereço publicado (Vercel).
   - Redirect URLs: `<endereço>/entrar` e `http://localhost:3100/entrar`.
4. Copiar a URL do projeto e a chave **publishable** (pública) para:
   - `apps/web/.env.local`, que nunca vai para o git (modelo em `apps/web/.env.example`);
   - as variáveis de ambiente do projeto na Vercel.

   A chave **secret/service_role nunca** entra no app nem no chat.
5. Publicar e testar no celular:
   1. Instalar na tela inicial.
   2. Entrar, pôr em modo avião e registrar uma visita com foto.
   3. Voltar o sinal e conferir que subiu.
   4. Abrir no computador e ver a mesma visita.

## Ainda não faz
- Convidar outras pessoas para a conta (Etapa 6).
- Levar o perfil ("quem assina") para a nuvem. Ele fica no aparelho e é apagado ao sair da conta.
- Apagar de verdade. A exclusão é lógica, como no aparelho.
