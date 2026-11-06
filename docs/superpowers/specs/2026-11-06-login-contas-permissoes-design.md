# Login, contas e permissões (design, 06/11/2026)

Pedido do Yuri (06/11): «tem que ter a parte do login para a pessoa criar a conta, como qualquer um dos tipos… cada conta vai ter suas funções, suas hierarquias… nem tudo todos vão ter acesso», «tem que fazer a tela de login», «eu quero o mais completo possível… tem que ficar perfeito».

## Por quê
Hoje o app abre direto com dados de demonstração; a conta na nuvem é opcional e fica no menu (`/entrar`). O papel do perfil (estagiário, técnico, engenheiro…) só muda textos e o modo campo/gestão: **não bloqueia nada**. Sem isso não dá para pôr uma equipe real nem convidar o produtor.

## O que já existe (base)
- Supabase: `contas`, `membros (conta_id, usuario_id, papel in dono|editor|leitor)`, `registros` genérico (JSON por tabela), RLS por conta, fotos no Storage por conta (`supabase/migrations/20261028223449_sincronizacao.sql`).
- App: `/entrar` com entrar, criar conta, recuperar senha e senha nova (`src/app/entrar/page.tsx`, `src/lib/sync/cloud.ts`); envio automático (`src/lib/sync/engine.ts`).

## Objetivos
1. Tela de entrada de verdade: é a primeira coisa que a pessoa vê.
2. Criar conta escolhendo o **tipo de conta** e o **papel**.
3. Hierarquia com permissões claras, aplicadas **no servidor** (RLS), não só escondendo botão.
4. Convidar pessoas (equipe e produtor) e tirar o acesso.
5. Continuar funcionando sem internet depois do primeiro acesso.

## Fora do escopo agora
- Cobrança e planos pagos (fica preparado: a conta tem `plano`, sem cobrar).
- Login com Google/Apple (fase 2, depende de configurar OAuth).
- Verificação em duas etapas (fase 2).

## Anti-objetivos (seria fracasso mesmo funcionando)
- A pessoa no campo, sem sinal, ser jogada para fora do app ou perder o que gravou.
- Um técnico ver custo ou margem porque o botão só estava escondido.
- Link mágico por e-mail que, no iPhone, abre no Safari em vez do app instalado e não loga.

## Decisões (minhas, para o Yuri conferir)
| Tema | Decisão | Por quê |
|---|---|---|
| Login obrigatório? | **Obrigatório para usar de verdade**, com botão "Conhecer o app" que abre a demonstração marcada como tal (nada sobe para a nuvem) | Yuri quer contas reais e hierarquia; a demonstração ajuda a mostrar para produtor |
| Sem sinal | Depois do primeiro acesso a sessão fica guardada; abrir sem internet **nunca** desloga. Token renova quando o sinal volta | O campo não tem sinal |
| Forma de entrar | E-mail e senha (já existe) **e código de 6 números por e-mail** | Código funciona no app instalado do iPhone; link mágico não |
| Primeiro acesso de quem já usou sem conta | Oferece trazer os dados do aparelho para a conta nova | Ninguém perde o que já fez |

## Tipos de conta (primeiro acesso)
| Opção na tela | Cria | Papel de quem cria |
|---|---|---|
| "Trabalho por conta própria" (engenheiro, consultor, técnico autônomo) | Conta individual | Dono + responsável técnico |
| "Empresa, revenda ou cooperativa" (equipe) | Conta de empresa, com nome e logo | Dono (gestor) |
| "Sou produtor rural" | Conta do produtor | Dono |
| "Recebi um convite" | Nada: entra na conta de quem convidou | O papel do convite |

## Papéis e hierarquia
Dono → Gestor → Responsável técnico → Técnico de campo / Monitor → Estagiário. À parte: Produtor convidado e Leitor.

| Pode… | Dono | Gestor | Resp. técnico | Técnico/Monitor | Estagiário | Produtor convidado | Leitor |
|---|---|---|---|---|---|---|---|
| Ver fazendas | todas | todas | todas | as atribuídas | as atribuídas | só as dele | as atribuídas |
| Registrar visita, foto, ponto | ✓ | ✓ | ✓ | ✓ | ✓ (vai para revisão) | — | — |
| Assinar recomendação e relatório | se for RT | — | ✓ | — | — | — | — |
| Editar ou apagar registro dos outros | ✓ | ✓ | ✓ | só os seus | só os seus | — | — |
| Ver custos, vendas, margem | ✓ | ✓ | configurável | — | — | os da fazenda dele, configurável | — |
| Estoque e insumos | ✓ | ✓ | ✓ | ver | ver | — | — |
| Gerar PDF e planilha | ✓ | ✓ | ✓ | visita | visita | relatórios das fazendas dele | ✓ |
| Convidar e tirar pessoas | ✓ | ✓ (menos dono) | — | — | — | — | — |
| Apagar a conta, plano | ✓ | — | — | — | — | — | — |

## Servidor (o que muda no Supabase)
- `membros.papel` passa a aceitar os papéis acima (migração mantém dono/editor/leitor como dono/gestor/leitor).
- `acessos_fazenda (conta_id, usuario_id, fazenda_id)`: quem vê qual fazenda, para os papéis "as atribuídas" e o produtor.
- `registros` ganha a coluna `fazenda_id` (preenchida no envio a partir do registro ou do talhão) e RLS por fazenda.
- Tabelas de dinheiro (`sales`, `expenses`, custo das operações) só são lidas por quem pode ver custos. O custo dentro de uma operação vai para um registro separado, para o RLS poder esconder (cabe ao construtor decidir a forma, desde que o bloqueio seja no servidor).
- `convites (código, conta, papel, fazendas, expira_em, usado_por)`: código de 10 letras (ABCDE-FGHJK) e link, validade de 7 dias, função `aceitar_convite`.
- Toda gravação guarda quem fez (`criado_por`, `alterado_por`).
- Visita de estagiário fica "aguardando revisão" até o supervisor aprovar.

## Telas
1. **Entrada**: marca, "Entrar", "Criar conta", "Conhecer o app".
2. **Entrar**: e-mail e senha, ou "receber código por e-mail"; esqueci a senha.
3. **Criar conta**: nome, e-mail, senha → tipo de conta → papel e registro profissional (CREA/CFTA) → nome da empresa e logo, se for empresa.
4. **Primeiro uso por tipo**: o que fazer primeiro (cadastrar fazenda, convidar equipe, aceitar convite).
5. **Pessoas da conta**: lista, convidar (papel e fazendas), trocar papel, tirar acesso.
6. **Trocar de conta**: quem trabalha para uma empresa e também tem clientes próprios.
7. **Minha conta**: sair (avisa se há registros esperando sinal), trocar senha, baixar meus dados, apagar conta (LGPD).
8. **Bloqueio**: mensagem clara "Só o gestor vê custos. Fale com <nome>", nunca uma tela vazia.
9. Termos de uso e política de privacidade (LGPD), aceitos ao criar a conta.

## Menu por papel
Cada papel vê só o que usa. Exemplos: o técnico não vê "Custos" nem "Vendas"; o produtor vê "Minhas fazendas", "Visitas", "Relatórios".

## Verificação
- Testes do servidor no PGlite (como em `978a50b`): cada papel tentando ler e gravar o que não pode → recusado.
- Testes das telas: criar conta de cada tipo, convite, revogar, entrar sem sinal.
- Teste real com duas contas (Yuri e a irmã) em dois aparelhos.

## Deixado para o construtor
Textos finais das telas, ordem exata dos passos do cadastro, forma de separar o custo da operação, nomes das colunas novas.
