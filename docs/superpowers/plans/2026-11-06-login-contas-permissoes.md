# Login, contas, papéis e administrador — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** login obrigatório com cadastro por tipo de conta, sete papéis com permissão aplicada no Supabase, convites, troca de conta e um painel de administrador da plataforma.

**Architecture:** o servidor continua com a tabela genérica `registros` (jsonb). Cada linha ganha `fazenda_id`, e o RLS passa a olhar papel + fazendas atribuídas + tabelas de dinheiro. Quem não vê custo recebe os registros por uma função que tira os campos de dinheiro, e o envio dessa pessoa nunca apaga o custo que está no servidor. No aparelho, `lib/permissions.ts` (puro) diz o que cada papel pode; o menu, as telas e o bloqueio leem dele.

**Tech Stack:** Next 16.4.3 (ler `apps/web/node_modules/next/dist/docs/` antes de mexer em rota), React 19, Dexie v9, Supabase (supabase-js), Vitest, `@electric-sql/pglite` (novo, só dev) para testar o SQL.

**Spec:** `docs/superpowers/specs/2026-11-06-login-contas-permissoes-design.md`

## Global Constraints
- Textos em pt-BR, linguagem de quem está no campo; mensagens de erro dizem o que fazer.
- Sem sinal **nunca** desloga nem perde registro (sessão do Supabase guardada; `needsInternet` só no primeiro acesso).
- Chave secret/service_role **nunca** no app, no repositório nem no chat. Só a publishable.
- Senha mínima: 8 caracteres. O Claude não cria nem digita senha de conta real (regra do Proton Pass).
- Papéis (valores no banco): `dono`, `gestor`, `rt` (responsável técnico), `tecnico`, `estagiario`, `produtor`, `leitor`.
- Tipos de conta: `autonomo`, `empresa`, `produtor`.
- Convite: código de 6 letras maiúsculas sem I, O (ex.: `KX4TPM`), validade de 7 dias, uso único.
- Arquivos do repositório são CRLF: editar preservando o fim de linha.
- Migrações novas em `supabase/migrations/2026110600000X_*.sql`; nunca editar as de 28/10.
- Publicar na Vercel só o commitado e só com autorização do Yuri.

## Review Focus
1. **Técnico edita uma operação com custo**: o envio dele não pode zerar o `cost` gravado pelo gestor (teste no Task 3).
2. **Pessoa tirada da conta com o celular sem sinal**: quando o sinal volta, o envio é recusado sem travar a fila e o aparelho limpa os dados daquela conta (teste no Task 7).
3. **Convite vencido, já usado ou digitado com minúscula/espaço**: mensagem clara; minúscula e espaço são aceitos (teste no Task 4).
4. **Aparelho com dados feitos sem conta** (uso antigo) que entra pela primeira vez: oferece levar para a conta nova, não apaga (teste no Task 7).
5. **Último dono tentando sair da conta ou rebaixar a si mesmo**: recusado ("a conta precisa de pelo menos um dono") (teste no Task 4).

---

### Task 1: Testar o SQL no PGlite

**Files:**
- Create: `apps/web/src/lib/sync/server.test.ts`, `apps/web/src/lib/sync/pglite-harness.ts`
- Modify: `apps/web/package.json` (devDependency `@electric-sql/pglite`)

**Interfaces:**
- Produces: `startServer(): Promise<Server>`; `Server.as(userId: string | null): { query(sql, params?) }` (define `request.jwt.claim.sub` e o papel `authenticated`/`anon`); `Server.newUser(email, meta?): Promise<string>` (insere em `auth.users`, dispara o gatilho).

- [ ] O harness cria stubs de `auth.users`, `auth.uid()` (lê `request.jwt.claim.sub`), papéis `anon`/`authenticated`, `storage.buckets`, `storage.objects`, `storage.foldername()` e aplica **todas** as migrações de `supabase/migrations/` em ordem.
- [ ] Teste `cada pessoa nova ganha a sua conta como dona` e `isola contas`: usuário B não lê registro de A; `anon` recebe "permission denied".
- [ ] Rodar `npx vitest run src/lib/sync/server.test.ts` → PASS (as migrações de 28/10 passam sem mudar nada).
- [ ] Commit `Servidor: testes do SQL no PGlite`.

### Task 2: Papéis, tipo de conta e administrador

**Files:**
- Create: `supabase/migrations/20261106000001_papeis_e_admin.sql`
- Test: `apps/web/src/lib/sync/server.test.ts`

**Interfaces:**
- Produces (SQL): `contas.tipo text check (tipo in ('autonomo','empresa','produtor'))`, `contas.plano text default 'teste'`; `membros.papel` com os 7 valores (migra `editor`→`gestor`); `privado.administradores(usuario_id)`; `public.sou_admin() returns boolean`; `public.minhas_contas() returns table(conta_id, nome, tipo, papel)`; `public.admin_contas() returns table(conta_id, nome, tipo, plano, criada_em, membros int, registros int, ultimo_envio timestamptz)` (erro se não for admin).
- O gatilho de cadastro lê `raw_user_meta_data ->> 'tipo'`; com `convite` no metadata **não** cria conta (a pessoa entra pela função do Task 4).

- [ ] Testes: cadastro com `tipo: 'empresa'` cria conta `empresa` e membro `dono`; com `convite` não cria conta; `admin_contas()` por não-admin → erro; por admin → lista todas.
- [ ] Rodar os testes → FAIL, escrever a migração, rodar → PASS.
- [ ] Commit `Servidor: papéis, tipo de conta e administrador da plataforma`.

### Task 3: Fazendas atribuídas e dinheiro protegido

**Files:**
- Create: `supabase/migrations/20261106000002_acesso_por_fazenda.sql`
- Test: `apps/web/src/lib/sync/server.test.ts`

**Interfaces:**
- Produces (SQL): `registros.fazenda_id text` (null = da conta toda); `acessos_fazenda(conta_id, usuario_id, fazenda_id)`; `privado.ve_tudo(conta, usuario)` (dono, gestor, rt); `privado.ve_custos(conta, usuario)` (dono, gestor; rt e produtor só com `membros.ve_custos = true`); `public.receber_registros(conta uuid, desde timestamptz, limite int)` no lugar do `select` direto, com os campos de dinheiro tirados para quem não vê custo; `enviar_registros` passa a receber `fazenda_id` no lote.
- Campos de dinheiro (constante única no SQL): `operations.cost`, `stockMoves.cost`; tabelas inteiras `sales` e `expenses`.

- [ ] Testes:
  - técnico com acesso só à fazenda F1 recebe F1 e o que é da conta toda (`fazenda_id` null), e não recebe F2;
  - técnico recebe a operação sem `cost` e não recebe nenhuma linha de `sales`/`expenses`;
  - **técnico reenvia a operação editada sem `cost` → no servidor o `cost` continua o do gestor**;
  - técnico tentando gravar `sales` → recusado;
  - leitor e produtor não gravam nada; produtor só recebe as fazendas atribuídas.
- [ ] Rodar → FAIL, escrever a migração, rodar → PASS.
- [ ] Commit `Servidor: acesso por fazenda e custos só para quem pode`.

### Task 4: Convites e pessoas da conta

**Files:**
- Create: `supabase/migrations/20261106000003_convites.sql`
- Test: `apps/web/src/lib/sync/server.test.ts`

**Interfaces:**
- Produces (SQL): `convites(codigo, conta_id, papel, fazendas text[], ve_custos bool, criado_por, expira_em, usado_por, usado_em)`; `public.criar_convite(conta, papel, fazendas text[], ve_custos bool) returns text` (dono e gestor; gestor não convida dono); `public.aceitar_convite(codigo text) returns uuid` (normaliza `upper(trim())`, erros `convite-invalido`, `convite-vencido`, `convite-usado`); `public.membros_da_conta(conta) returns table(usuario_id, nome, email, papel, ve_custos, fazendas text[])`; `public.mudar_membro(conta, usuario, papel, fazendas text[], ve_custos)`; `public.tirar_membro(conta, usuario)`.
- Regra: a conta sempre tem pelo menos um dono (`ultimo-dono`).

- [ ] Testes: convite aceito com `' kx4tpm '` funciona; vencido, usado e inexistente dão o erro certo; técnico não cria convite; último dono não sai nem se rebaixa; membro tirado deixa de receber registros na hora.
- [ ] Rodar → FAIL, escrever, rodar → PASS.
- [ ] Commit `Servidor: convites, troca de papel e saída da conta`.

### Task 5: Permissões no aparelho

**Files:**
- Create: `apps/web/src/lib/permissions.ts`, `apps/web/src/lib/permissions.test.ts`

**Interfaces:**
- Produces: `type Papel = "dono" | "gestor" | "rt" | "tecnico" | "estagiario" | "produtor" | "leitor"`; `type Pode = "registrar" | "assinar" | "editarDosOutros" | "verCustos" | "estoque" | "convidar" | "apagarConta" | "relatorios"`; `can(papel: Papel, acao: Pode, opts?: { veCustos?: boolean }): boolean`; `PAPEIS: { value: Papel; label: string; text: string }[]`; `blockedMessage(acao: Pode, quemLibera: string): string`.
- Valores: a tabela "Papéis e hierarquia" do spec, exatamente.

- [ ] Teste `segue a tabela do spec` cobrindo cada célula (um `it.each` por linha da tabela); `blockedMessage("verCustos", "Ana")` → `"Só quem gerencia a conta vê custos. Fale com Ana."`.
- [ ] FAIL → implementar → PASS. Commit `Permissões por papel no aparelho`.

### Task 6: Login, código por e-mail e cadastro por tipo

**Files:**
- Modify: `apps/web/src/lib/sync/cloud.ts`
- Test: `apps/web/src/lib/sync/cloud.test.ts` (com Supabase falso)

**Interfaces:**
- Consumes: `minhas_contas`, `aceitar_convite` (Tasks 2 e 4).
- Produces: `CloudAccount` passa a ter `papel: Papel`, `veCustos: boolean`, `tipo: "autonomo" | "empresa" | "produtor"`, `nome: string`; `sendCode(email): Promise<void>` (`signInWithOtp`, `shouldCreateUser: false`); `verifyCode(email, code): Promise<CloudAccount>` (`verifyOtp` type `email`); `signUp(input: { nome; email; senha; tipo?; convite? })`; `listAccounts(): Promise<CloudAccount[]>`; `switchAccount(contaId): Promise<CloudAccount>` (só com nada pendente, como `signOut`); `refreshAccount()` (atualiza papel ao receber, para o caso de mudança de papel).

- [ ] Testes: `verifyCode` com código errado → "Código errado ou vencido. Peça outro."; `signUp` com convite chama `aceitar_convite`; `switchAccount` com pendente → recusa com a contagem.
- [ ] FAIL → implementar → PASS. Commit `Conta: código por e-mail, cadastro por tipo e troca de conta`.

### Task 7: Envio com fazenda e acesso tirado

**Files:**
- Modify: `apps/web/src/lib/sync/engine.ts`, `apps/web/src/lib/sync/cloud.ts` (pull pelo `receber_registros`)
- Test: `apps/web/src/lib/sync/engine.test.ts`

**Interfaces:**
- Produces: `farmOf(table: SyncedTable, row, lookup): string | null` (farms → id; plots, visits, operations, rainfall, points → farmId; seasons → fazenda do talhão; findings, photos → fazenda da visita; sales, expenses → farmId ou null; supplies, stockMoves, clients → null); `OutgoingRow.fazenda_id`.
- Membro tirado: erro de permissão no envio → `signOut` forçado sem checar pendentes, aviso "Seu acesso a <conta> foi retirado por quem gerencia a conta. O que estava neste aparelho foi apagado."
- Primeiro acesso com dados feitos sem conta: pergunta "Levar para a sua conta" ou "Começar do zero"; levar = marcar tudo `_pendente: 1`.

- [ ] Testes: `farmOf` para cada tabela; envio recusado por permissão limpa o aparelho e não fica em laço; dados antigos sem conta continuam no aparelho e ficam pendentes ao escolher levar.
- [ ] FAIL → implementar → PASS. Commit `Envio por fazenda e acesso retirado`.

### Task 8: Porta de entrada (login obrigatório)

**Files:**
- Create: `apps/web/src/components/gate.tsx`
- Modify: `apps/web/src/components/app-shell.tsx`, `apps/web/src/app/entrar/page.tsx` (vira as telas: entrada, entrar, código, criar conta em passos, senha nova)
- Test: `apps/web/src/components/gate.test.ts` (lógica pura `gateState`)

**Interfaces:**
- Produces: `gateState({ cloudConfigured, linked, demo, path }): "app" | "entrada"`; rotas livres: `/entrar`, `/convite`, `/termos`, `/privacidade`.
- Sem nuvem configurada (desenvolvimento sem `.env.local`) → sempre `"app"`.
- "Conhecer o app" = `loadDemo()` + entra no app; o link `?exemplo=1` (`86234e6`) continua funcionando.
- Cadastro em passos: (1) nome, e-mail, senha e aceite dos termos; (2) tipo de conta (os 4 cartões do spec); (3) papel e registro profissional (CREA/CFTA), reaproveitando `ROLES` de `lib/profile.ts`; (4) se empresa: nome e logo (`logo-picker.tsx`).

- Primeiro uso por tipo (no painel vazio): autônomo → "Cadastre o primeiro cliente"; empresa → "Convide sua equipe" e "Cadastre a primeira fazenda"; produtor → "Cadastre sua fazenda" e "Chame seu agrônomo".
- [ ] Teste `gateState` para as combinações; conferir no navegador em 390 px: abrir sem conta → entrada; "Conhecer o app" → painel com exemplo; criar conta → passos → painel vazio.
- [ ] Commit `Login obrigatório e cadastro em passos`.

### Task 9: Menu, bloqueio e revisão do estagiário

**Files:**
- Create: `apps/web/src/components/blocked.tsx`
- Modify: `apps/web/src/components/app-shell.tsx` (MENUS filtrados por `can`), telas de custos/vendas/despesas/estoque, `apps/web/src/components/visit-form.tsx`, `apps/web/src/lib/db.ts` (campo `review?: "pendente" | "aprovada"` na visita, sem versão nova do Dexie porque não é índice)

**Interfaces:**
- Consumes: `can`, `blockedMessage` (Task 5); `CloudAccount.papel` (Task 6).
- Produces: `<Blocked acao="verCustos" />`; visita de estagiário nasce `review: "pendente"`; `rt`/`gestor`/`dono` veem "Aprovar" na visita; PDF de visita pendente sai com a faixa "Aguardando revisão de <supervisor>".

- [ ] Testes: menu do `tecnico` sem Custos/Vendas/Despesas; do `produtor` só Fazendas, Visitas, Relatórios; visita de estagiário nasce pendente.
- [ ] Commit `Menu por papel, aviso de bloqueio e revisão do estagiário`.

### Task 10: Pessoas da conta, convite e minha conta

**Files:**
- Create: `apps/web/src/app/equipe/page.tsx`, `apps/web/src/app/convite/page.tsx`, `apps/web/src/app/conta/page.tsx`, `apps/web/src/app/termos/page.tsx`, `apps/web/src/app/privacidade/page.tsx`

**Interfaces:**
- Consumes: `criar_convite`, `membros_da_conta`, `mudar_membro`, `tirar_membro` (Task 4); `listAccounts`, `switchAccount` (Task 6).
- `/equipe`: lista, "Convidar" (papel, fazendas, ver custos) → mostra código e link `/convite?codigo=XXXXXX` com botão de compartilhar (`navigator.share`, senão copiar). Trocar papel e tirar com confirmação na própria tela (sem `confirm()`).
- `/conta`: trocar de conta, trocar senha, sair (regra atual de pendentes), baixar meus dados (backup existente), apagar conta (pede digitar o e-mail).

- [ ] Conferir no navegador com duas contas de teste locais (senhas de teste não vão ao Proton).
- [ ] Commit `Equipe, convite e minha conta`.

### Task 11: Painel do administrador

**Files:**
- Create: `apps/web/src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `sou_admin`, `admin_contas` (Task 2).
- Só aparece no menu de quem `sou_admin()`; mostra contas, tipo, plano, quantas pessoas, quantos registros e o último envio. Só leitura nesta fase.

- [ ] Conferir: usuário comum em `/admin` vê "Esta área é só da administração do AgroNexus."
- [ ] Commit `Painel do administrador`.

### Task 12: Levar para o Supabase de verdade (com o Yuri)

- [ ] Yuri dá acesso: `! npx supabase login` no terminal (o token fica com o CLI; não colar no chat) ou conecta o plugin à conta do `agronexus`.
- [ ] Aplicar as 3 migrações novas; `get_advisors` sem erro.
- [ ] Authentication → Email: ativar o código de 6 números no modelo do e-mail (`{{ .Token }}`); URL Configuration: Site URL `https://agronexus-chi.vercel.app`, Redirect URLs `https://agronexus-chi.vercel.app/**` e `http://localhost:3100/**`.
- [ ] **Contas de administrador:** Yuri cria a conta dele pelo app publicado (senha gerada e salva no Proton Pass antes, com o passo a passo entregue na hora); depois o Claude roda `insert into privado.administradores` com o id dele. A irmã cria a dela como `autonomo`.
- [ ] Teste real: conta do Yuri convida a irmã como `rt`, ela aceita no iPhone, grava visita sem sinal, volta o sinal, aparece no aparelho do Yuri.
- [ ] Atualizar `supabase/README.md`, `docs/roadmap.md`, cofre.
