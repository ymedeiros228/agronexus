# AgroNexus — Análise Profissional e Plano Mestre

Base: `AgroNexus_Ideia_Completa.zip` (README + 10 documentos) e o briefing inicial.
Status: **proposta para aprovação. Nenhum código foi escrito.**
Tudo marcado como "hipótese" precisa ser validado com usuários reais.

---

## 1. Resumo executivo

O AgroNexus é um SaaS de gestão agrícola que junta propriedade, talhões, safras, operações, custos, clima e sensores num só lugar. Em cima disso, uma IA responde perguntas sobre os dados reais da operação.

Minha leitura crítica: **a ideia é boa, mas o escopo é de uma empresa inteira, não de um MVP.** São 17 módulos, IoT, clima, IA e multiempresa. O risco principal não é técnico. É construir muito antes de provar que um tipo de usuário usa o produto toda semana.

Recomendação central:

1. **Escolher um nicho de entrada** (ver §7) em vez de atender todo o agro.
2. **MVP = caderno de campo digital + custos + dashboard.** Esse é o ciclo diário do produtor: registrar o que foi feito, quanto custou e o que isso rendeu.
3. **IA só depois que existir dado.** Sem histórico acumulado, a IA não tem o que analisar. Ela entra a partir da Fase 8 deste plano.
4. **Mobile e uso sem sinal são requisitos de MVP**, não polimento. No campo, o registro acontece no talhão, com internet ruim.
5. **Arquitetura: monólito modular em TypeScript, PostgreSQL + PostGIS, multiempresa desde o dia 1.** Sem microsserviços, sem Kubernetes, sem Redis no início.

## 2. Entendimento do produto

Camadas, de baixo para cima:

| Camada | O que é | Exemplos |
|---|---|---|
| Registro | O que o usuário informa | propriedade, talhão, safra, operação, insumo, colheita |
| Fontes externas | O que chega sozinho | clima, sensores IoT |
| Análise | Dados viram indicadores | produtividade/ha, custo/ha, comparação entre safras |
| Atenção | O sistema avisa | alertas de prazo, estoque, clima, sensor |
| Inteligência | O sistema explica | perguntas em linguagem natural, insights, recomendações |

Hierarquia de dados: Organização → Propriedade → Talhão → Safra (ciclo de um talhão com uma cultura) → Operações/Colheitas/Custos.

## 3. Problema

Informação agrícola está espalhada em cadernos, planilhas, WhatsApp, apps separados e na cabeça de quem toca a fazenda. Consequências:

- ninguém sabe o custo real por hectare ou por talhão;
- comparar safras exige refazer planilha;
- problemas (praga, atraso de operação, estoque baixo) são percebidos tarde;
- quando o gerente ou agrônomo sai, o histórico vai junto.

Hipótese a validar: **o maior dor percebido é custo e controle de operações, não "falta de IA".** Entrevistar 10 a 15 produtores/agrônomos antes de fechar o MVP.

## 4. Público-alvo

| Perfil | Papel no sistema | Necessidade principal |
|---|---|---|
| Produtor / dono | Decide | Ver custo, resultado e riscos sem esforço |
| Gestor de fazenda | Opera e supervisiona | Operações atrasadas, estoque, equipe |
| Agrônomo / consultor | Recomenda, atende várias fazendas | Histórico do talhão, ocorrências, relatórios para o cliente |
| Equipe de campo | Registra | Lançar operação em 20 segundos, no celular, sem sinal |

Observação: **agrônomo/consultor é um canal de distribuição.** Um consultor atende várias propriedades; conquistar ele traz vários clientes. O modelo de dados deve permitir um usuário em várias organizações.

## 5. Proposta de valor

"Saiba quanto cada talhão custou, produziu e o que precisa de atenção hoje, sem planilha."

Para cada perfil:
- **Produtor:** custo por hectare e resultado da safra em tempo real.
- **Gestor:** o que está atrasado e o que falta.
- **Agrônomo:** histórico completo e relatório pronto para o cliente.
- **Campo:** registro rápido, mesmo offline.

## 6. Diferenciais (e quais são defensáveis)

| Diferencial | Defensável? | Comentário |
|---|---|---|
| UX premium e simples | Sim, a médio prazo | O agro tem muito software feio e pesado. É vantagem real, mas copiável |
| IA com contexto e explicabilidade | Sim, **com dados acumulados** | O valor está nos dados do cliente, não no modelo |
| Dados históricos do cliente | **Sim, é o principal** | Quanto mais tempo de uso, mais difícil sair |
| Funciona offline no campo | Sim | Poucos concorrentes fazem bem |
| Gestão agrícola em si | Não | É o mínimo esperado |

## 7. Análise crítica da ideia

**Pontos fortes:** visão clara; regras agronômicas honestas (não inventar dado, IA não substitui agrônomo); roadmap incremental; PostgreSQL e multiempresa já previstos.

**Pontos fracos / lacunas:**

1. **Sem nicho.** "Agronegócio" é grande demais. Soja de 2.000 ha no Cerrado, hortifruti familiar, fruticultura irrigada e pecuária têm rotinas bem diferentes. Cultura, unidades, ciclo e custos mudam. **Decisão necessária do fundador:** qual cultura/região primeiro?
2. **Offline não aparece nos documentos.** Para campo, é crítico.
3. **Pecuária** não está prevista. Se o público incluir fazendas mistas, vai ser cobrado. Fica fora do MVP, mas a decisão deve ser consciente.
4. **Onboarding.** O usuário já tem dados em planilhas. Sem importação (CSV, KML/Shapefile para talhões), a adoção trava.
5. **Mapa de talhões** é parte do valor, não enfeite. Desenhar ou importar o polígono é o primeiro "uau".
6. **Integrações** (balança, ERP, notas fiscais, John Deere Operations Center etc.) são esperadas por empresas, mas ficam fora do início.
7. **Conformidade:** LGPD, e para defensivos, regras de receituário agronômico e registro MAPA. O sistema **registra**; não prescreve.
8. **Custo de IA** (tokens) precisa entrar na conta do plano pago.

## 8. Funcionalidades necessárias (MVP)

O MVP responde: "o que foi feito em cada talhão, quanto custou, quanto produziu e o que precisa de atenção".

- Autenticação, organização, convite de membros, papéis (Dono, Gestor, Agrônomo, Operador, Leitor).
- Propriedades.
- Talhões com polígono no mapa (desenhar ou importar KML/GeoJSON) e área calculada.
- Culturas e cultivares (catálogo base + cadastro próprio).
- Safras.
- Operações agrícolas (tipos do briefing) com data, talhão, responsável, insumos usados, custo, observação e foto.
- Insumos e estoque simples (entrada, saída por operação, saldo, preço médio).
- Colheita e produtividade (por talhão, comparação entre safras).
- Custos (derivados das operações e insumos; mão de obra e custos avulsos).
- Dashboard "o que precisa de atenção" (§19).
- Alertas básicos (operação atrasada, estoque baixo).
- Ocorrências fitossanitárias simples (registro com foto e local).
- PWA com registro offline de operações e ocorrências.
- Exportação CSV/PDF de relatório da safra.
- Auditoria de alterações e exclusão lógica.
- Light e dark mode, responsivo.

## 9. Fora do MVP

- IA conversacional e insights (Fase de inteligência).
- Clima (começar com um provedor simples depois do MVP).
- IoT e sensores; irrigação automatizada.
- Pecuária.
- Integrações com ERP, maquinário e nota fiscal.
- Marketplace, financeiro completo, folha de pagamento.
- Imagem de satélite/NDVI (candidato forte à Fase 2 de produto).
- App nativo (PWA primeiro).
- Planos de cobrança automatizados (cobrar manualmente os primeiros clientes piloto).
- Relatórios customizáveis.

## 10. Sugestões de melhorias ao conceito

1. **Registro rápido primeiro.** Meta: lançar uma operação em até 3 toques ou 20 segundos.
2. **Mapa como navegação.** Clicar no talhão abre sua história (linha do tempo).
3. **Linha do tempo do talhão.** Tudo que aconteceu, em ordem. É o "caderno de campo" que o agrônomo quer.
4. **Dado com origem.** Todo valor tem `fonte` (manual, sensor, importado, estimado) e `observado/estimado`. Isso materializa a regra do doc 07.
5. **Insights por regras antes de IA.** "Talhão X com custo 18% acima da média" é uma regra, não um LLM. Entrega valor cedo e alimenta a IA depois.
6. **Importação assistida** de planilhas.
7. **Modo consultor:** painel multi-fazenda para agrônomos.
8. **Dados de exemplo (demo)** para testar o produto sem cadastrar nada.

## 11. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Escopo grande demais | Alto | MVP enxuto, fases com critério de saída |
| Nicho indefinido | Alto | Decidir cultura/região piloto na Fase 0 |
| Baixa adoção no campo | Alto | Offline, registro rápido, treinamento, 3 a 5 pilotos reais |
| Qualidade ruim de dados | Alto | Validação, unidades fixas, origem do dado, importação guiada |
| IA errada (alucinação) | Alto | IA só consulta dados reais via ferramentas; sempre cita fontes; sem recomendação agronômica crítica automática |
| Conectividade rural | Médio-alto | PWA offline, sincronização com resolução de conflitos |
| Vazamento entre organizações | Crítico | `organization_id` em tudo + RLS no Postgres + testes de isolamento |
| LGPD e dados sensíveis | Médio | Minimização, região BR, política de retenção |
| Dependência de terceiros (clima, mapas) | Médio | Camada de abstração e provedor trocável |
| Custo de infra/IA | Médio | Métricas por organização, limites por plano |
| Um desenvolvedor só (gargalo) | Médio | Stack única (TypeScript), pouca infra, automação em CI |
| Concorrência (Aegro, Agrosmart, Farmbox etc.) | Médio | Nicho + UX + offline. Fazer pesquisa de concorrentes na Fase 0 |

## 12. Modelo de negócio sugerido

Todos os valores são **hipóteses**. Não defini preços; isso depende de pesquisa.

- **Estrutura:** SaaS por assinatura, com limite por hectares gerenciados (métrica que acompanha o valor percebido) e número de usuários.
- **Gratuito:** 1 propriedade, área limitada, dashboard essencial. Serve para aquisição.
- **Profissional:** mais área, custos, relatórios, clima, offline completo.
- **Empresarial:** equipes, permissões avançadas, integrações, IoT, IA, suporte.
- **Plano consultor:** preço por fazenda atendida (canal de distribuição).
- **Validação:** primeiros pilotos sem cobrança automatizada; cobrar manualmente (Pix/boleto) para testar disposição de pagar antes de investir em billing.
- **IA:** não prometer ilimitado. Franquia de consultas por plano.

## 13. Arquitetura recomendada

**Monólito modular**, um repositório (monorepo), dois apps:

```
Web (Next.js, PWA) ──HTTPS──► API (NestJS) ──► PostgreSQL + PostGIS
                                  │
                                  ├─► Worker (jobs: alertas, relatórios, clima, ingestão)
                                  └─► Armazenamento de arquivos (S3 compatível)
```

Princípios:
- **Módulos por domínio** (properties, plots, crops, seasons, operations, inputs, costs, ...) com fronteiras claras. Se um dia precisar separar, já está separado.
- **Multiempresa por linha:** toda tabela de negócio tem `organization_id`; **Row Level Security** do Postgres como segunda barreira além da camada de aplicação.
- **Offline:** o cliente guarda operações pendentes localmente (IndexedDB) e sincroniza com chaves de idempotência geradas no cliente (UUID). Conflitos: última escrita por campo, com auditoria.
- **Eventos internos simples** (ex.: "operação registrada" dispara recálculo de custo e alerta) via fila no próprio Postgres.
- **IA como módulo isolado:** só acessa dados via camada de consulta com escopo da organização do usuário (ver §14 e doc 03).
- **IoT:** endpoint de ingestão separado e fino, escrevendo em tabela particionada. Fica desenhado, mas só implementado na fase própria.

## 14. Stack recomendada (cada item com justificativa)

| Área | Escolha | Por quê |
|---|---|---|
| Linguagem | **TypeScript** em tudo | Um só idioma e tipos compartilhados (um dev só, menos atrito) |
| Monorepo | **pnpm + Turborepo** | Compartilhar tipos/validações entre web e API com cache de build |
| Frontend | **Next.js (App Router) + React** | SSR/SEO nas páginas públicas, ecossistema, PWA |
| UI | **Tailwind + Radix UI (primitivos) + componentes próprios** | Acessibilidade pronta (foco, teclado, ARIA) sem cair em visual genérico; design system nosso |
| Estado/dados | **TanStack Query** + estado local simples | Cache e revalidação sem estado global pesado |
| Formulários | **React Hook Form + Zod** | Validação única compartilhada com a API |
| Gráficos | **Recharts** ou **visx** (decidir por protótipo) | Leve, customizável com nossos tokens |
| Mapas | **MapLibre GL** | Open source, sem lock-in e sem custo por visualização; tiles via provedor trocável |
| Backend | **NestJS (Fastify adapter)** | Estrutura modular que casa com o doc 05 (controllers/services/repositories), DI, bom para um domínio grande |
| Validação | **Zod** nas bordas | Mesma fonte de verdade que o frontend |
| Banco | **PostgreSQL 16 + PostGIS** | Relacional e transacional; PostGIS para polígonos, área e consultas espaciais |
| ORM | **Drizzle ORM** + migrações SQL | Suporta tipos geométricos e RLS com SQL explícito; Prisma é mais confortável mas pior para PostGIS. *Confirmar em ADR com um protótipo na Fase 1* |
| Séries temporais | Tabela particionada por tempo; **TimescaleDB só se necessário** | Evita complexidade até haver volume real de sensores |
| Auth | **Better Auth** (ou Auth.js), sessão em cookie httpOnly, Argon2id | Auth própria mínima, com suporte a organizações. *Decidir em ADR; critério: organizações, MFA, manutenção ativa* |
| Autorização | RBAC por organização + checagem por recurso (policies) | Papéis claros, testáveis |
| Armazenamento | **S3 compatível (Cloudflare R2 ou similar)** | Fotos de ocorrências, anexos; URLs assinadas |
| Cache | **Nenhum no início** (cache HTTP + TanStack Query). Redis só com métrica que justifique | Menos peças para operar |
| Filas | **pg-boss** (fila no Postgres) | Sem Redis; suficiente para alertas, relatórios, clima |
| Logs/monit. | **pino + OpenTelemetry + Sentry** | Logs estruturados, rastreio, erros no front e no back |
| Testes | **Vitest** (unit/integração), **Playwright** (E2E), testes de isolamento entre organizações | Cobrir o que dá prejuízo: regra de custo e vazamento de dados |
| CI/CD | **GitHub Actions** | Lint, tipos, testes, build, migração, deploy |
| Docker | **Docker Compose só para desenvolvimento** (Postgres/PostGIS, mailhog); imagem Docker da API | Ambiente igual para todos |
| Deploy (hipótese) | Web: Vercel. API/worker: Fly.io ou Railway. Postgres gerenciado com PostGIS em região **São Paulo** (latência e LGPD) | Pouca operação no início. Reavaliar custo ao crescer |
| IA (fase própria) | API de LLM com **tool calling** sobre consultas SQL pré-definidas e seguras (nada de SQL livre gerado pelo modelo) | Evita alucinação e vazamento entre organizações |

O que **não** entra agora: Kubernetes, microsserviços, GraphQL, Kafka, Redis, app nativo.

## 15. Estrutura de banco recomendada

Convenções: `id` UUID (v7), `organization_id` em toda tabela de negócio, `created_at`, `updated_at`, `created_by`, `deleted_at` (exclusão lógica), unidades guardadas em padrão SI (ha, kg, L, mm) com unidade explícita em campos de quantidade.

**Identidade e acesso**
- `users`
- `organizations`
- `memberships` (user, organization, role): permite um agrônomo em várias organizações
- `invitations`
- `audit_logs` (quem, o quê, quando, antes/depois)

**Domínio agrícola**
- `properties` (organização, nome, localização, área, geometria opcional)
- `plots` (talhões: property, nome, `geometry` polygon, `area_ha` calculada, solo, status)
- `crops` e `cultivars`: catálogo global base + itens da organização (`organization_id` nulo = catálogo do sistema)
- `seasons` (safra: período, ano-safra, status)
- `plot_seasons` (talhão em uma safra: cultura, cultivar, datas de plantio/colheita, área plantada). **Esta é a entidade central.** Custo e produtividade são calculados por ela
- `operations` (plot_season, tipo, data planejada/realizada, status, responsável, custo de mão de obra/máquina, observação)
- `operation_inputs` (operação, insumo, quantidade, dose/ha, custo unitário aplicado)
- `inputs` (produtos: categoria, unidade, registro MAPA opcional)
- `stock_movements` (entrada/saída/ajuste; saldo derivado, não gravado)
- `harvests` (plot_season, quantidade, unidade, umidade, data)
- `cost_entries` (custos avulsos ligados a organização/propriedade/talhão/safra; custos de operação são derivados)
- `phyto_occurrences` (tipo praga/doença/daninha, severidade, local, foto, medida tomada, status)
- `attachments` (arquivo, vínculo polimórfico controlado)

**Alertas e relatórios**
- `alert_rules`, `alerts` (origem, severidade, status, lido/resolvido)
- `reports` (tipo, parâmetros, arquivo gerado)

**Clima e IoT (fases posteriores)**
- `weather_observations` (propriedade, instante, variáveis, **fonte**, observado/previsão)
- `devices` (propriedade/talhão, tipo, token hash)
- `sensors` (device, grandeza, unidade)
- `sensor_readings` (sensor, instante, valor; **particionada por mês**)

**IA (fase posterior)**
- `ai_conversations`, `ai_messages` (guardar quais consultas/dados foram usados e o período, para auditoria e explicabilidade)

Pontos de atenção:
- Índices em `(organization_id, ...)` em toda consulta frequente; índice GiST nas geometrias.
- RLS: política `organization_id = current_setting('app.org_id')`. Teste automatizado que tenta ler dados de outra organização e deve falhar.
- **Não** criar `culturas por talhão` fixas: a cultura mora em `plot_seasons`, pois muda a cada safra.
- Tabelas de relatório e custo agregado são **derivadas** (views/consultas), não duplicadas, até haver problema de desempenho.

## 16. Estrutura de frontend

```
apps/web/
  src/
    app/                  rotas (Next App Router)
      (public)/           landing, preços, blog (SEO)
      (auth)/             login, convite, recuperação
      (app)/              área logada
        [org]/dashboard
        [org]/propriedades, talhoes, safras, operacoes, estoque, custos, ocorrencias, relatorios, alertas
    features/             uma pasta por domínio (componentes, hooks, schemas do domínio)
    components/ui/        design system (Button, Input, Select, Card, Badge, Dialog, Table, Toast...)
    lib/                  api client, auth, offline-sync, formatadores (ha, R$, datas)
    styles/               tokens (CSS variables), tema
packages/
  shared/                 schemas Zod, tipos, constantes (tipos de operação, unidades)
  config/                 eslint, tsconfig, tailwind preset
```

Regras: nada de fetch solto em componentes (sempre via hooks de `features/`); schemas vêm de `packages/shared`; componentes `ui/` não conhecem o domínio.

## 17. Estrutura de backend

```
apps/api/
  src/
    modules/<dominio>/    controller, service, repository, dto (Zod), policies, tests
    common/               auth guard, org context, RLS session, audit interceptor, errors, pagination
    infra/                db (drizzle), storage, queue (pg-boss), mailer, logger, config validada
    jobs/                 alertas, relatórios, clima
  drizzle/                migrações SQL
apps/worker/              consome fila (pode começar dentro da API e separar depois)
```

Regras: controller só traduz HTTP; regra de negócio no service; consulta no repository; **todo acesso a banco passa pelo contexto da organização** (RLS). API REST versionada (`/v1`), documentada com OpenAPI gerado do Zod. Erros padronizados. Idempotência em endpoints de sincronização offline. Rate limit e limites de upload.

## 18. Design System

**Direção:** "precisão calma". Muito espaço em branco, tipografia forte, cor usada com significado, números em destaque. Agrícola sem clichê (sem folhas, sem verde-bandeira).

**Cor** (valores iniciais, validar contraste WCAG AA no protótipo):
- Marca: verde-musgo profundo (`#1F5C3F`) e um acento **lima** (`#B6E05A`) usado com parcimônia (destaques, estados ativos). Dark mode usa superfícies quase pretas esverdeadas, não cinza puro.
- Neutros: escala de 11 tons levemente quentes.
- Semânticas: sucesso (verde), atenção (âmbar), crítico (vermelho terroso), informação (azul-petróleo). **Sempre com ícone e texto**, nunca só cor.
- Paleta de gráficos própria, testada para daltonismo.

**Tipografia:** Inter (variável) para interface; números tabulares nos indicadores. Escala modular: 12/14/16/20/24/32/40. Corpo mínimo 16px no mobile.

**Espaçamento e grid:** base 4px; escala 4/8/12/16/24/32/48/64. Grid de 12 colunas no desktop, 4 no mobile. Alvos de toque mínimo 44px.

**Forma:** raio 8px (controles) e 12px (cards). Bordas de 1px com baixo contraste; **sombras só em camadas flutuantes** (menus, modais). Cards planos.

**Movimento:** 120 a 200 ms, easing suave; respeita `prefers-reduced-motion`.

**Componentes (todos com estados: padrão, hover, foco visível, ativo, desabilitado, carregando, erro):** botão (primário, secundário, fantasma, destrutivo), input, select/combobox, checkbox, switch, radio, date picker, card, tabela (densa e cartões no mobile), badge, alerta/banner, toast, modal/drawer, menu, sidebar (desktop) e barra inferior (mobile), command palette (Ctrl+K), tabs, tooltip, empty state, skeleton, página de erro, gráficos e mapa.

**Princípio de dados:** valores estimados e previstos têm identidade visual distinta de valores observados (ex.: tracejado e rótulo "estimado"). Implementa a regra do doc 07.

## 19. UX

**Navegação:** desktop com sidebar; mobile com barra inferior de 4 itens + botão central **"Registrar"**. Command palette para usuários avançados.

**Dashboard (responde às 5 perguntas do doc 04):**
1. **Como está a propriedade?** Faixa de saúde: área, safras ativas, % de operações em dia, custo acumulado vs. planejado.
2. **O que precisa de atenção?** Lista priorizada (atrasos, estoque, ocorrências abertas, alertas), cada item com ação direta.
3. **O que aconteceu recentemente?** Linha do tempo das últimas operações.
4. **Melhorando ou piorando?** Indicadores com variação contra safra anterior e tendência.
5. **Próxima ação recomendada?** Inicialmente por regras; depois com IA, com fonte.

Mapa de talhões colorido por indicador escolhido (status, custo/ha, produtividade).

**Fluxos críticos:**
- **Primeiro uso:** criar organização → criar propriedade → desenhar/importar talhões → criar safra → registrar a primeira operação. Meta: valor visível em menos de 10 minutos. Opção de dados de exemplo.
- **Registrar operação:** tipo → talhões (múltiplos) → data → insumos/doses → confirmar. Offline, com selo "pendente de sincronização".
- **Agrônomo:** troca de fazenda em um clique; relatório de safra em PDF.

**Estados:** vazio (explica e oferece ação), carregando (skeleton), erro (diz o que houve e o que fazer), sucesso (toast discreto com opção de desfazer).

**Acessibilidade:** contraste AA, navegação completa por teclado, foco visível, labels em todos os campos, mensagens de erro associadas ao campo, leitor de tela testado nos fluxos críticos, nenhuma informação só por cor.

**Linguagem:** português simples, termos do campo (talhão, safra, gleba), sem jargão de TI. Unidades sempre visíveis.

## 20. Roadmap completo

Cada fase só termina com: testes passando, documentação e `PROJECT_CONTEXT.md` atualizados, revisão de segurança do que foi feito.

### Fase 0 — Descoberta (você + eu)
- Definir **nicho piloto** (cultura/região), perfil principal e 3 a 5 usuários piloto.
- Entrevistas rápidas e levantamento de concorrentes.
- Aprovar este plano, MVP e stack (registrar ADRs).
- Saída: nicho decidido, MVP congelado, ADR-001 a 005.

### Fase 1 — Fundação técnica
- Monorepo, lint, tipos, CI, Docker Compose dev, ambientes (dev/staging).
- Banco com PostGIS, migrações, RLS base, logs, Sentry.
- Design system v0 (tokens, tema claro/escuro, 10 componentes base) e página de componentes.
- Saída: "hello world" ponta a ponta, deploy em staging, teste de isolamento rodando no CI.

### Fase 2 — Identidade, organizações e permissões
- Cadastro, login, recuperação de senha, MFA opcional, convites, papéis, troca de organização, auditoria.
- Saída: dois usuários em organizações diferentes **provadamente isolados** por testes.

### Fase 3 — Propriedades e talhões
- CRUD, mapa MapLibre, desenhar/importar polígono, área calculada, solo, status.
- Importação KML/GeoJSON.

### Fase 4 — Culturas, cultivares e safras
- Catálogo base, cultivares próprias, safras, `plot_seasons`.
- (Unidas de propósito: sozinhas, culturas não geram valor.)

### Fase 5 — Operações, insumos e estoque
- Registro de operações (todos os tipos), insumos, movimentação de estoque, anexos/fotos.
- Custo nasce aqui: operação com insumo e mão de obra já gera custo.
- **Registro offline e sincronização** (PWA) já nesta fase, não depois.

### Fase 6 — Colheita, produtividade e custos
- Colheitas, produtividade por talhão/cultivar/safra, comparação entre safras, custo por talhão/ha/safra.

### Fase 7 — Dashboard, alertas e fitossanidade
- Dashboard "atenção" completo, alertas por regras (atraso, estoque, prazo), ocorrências fitossanitárias com foto.
- **Marco: MVP pronto para pilotos reais.**

### Fase 8 — Relatórios
- Relatório de safra, custos, produtividade, operacional (PDF e CSV); modo consultor básico.

### Fase 9 — Clima
- Provedor de clima, histórico por propriedade, previsão, alertas climáticos; marcação observado vs. previsão.

### Fase 10 — Inteligência por dados (sem LLM)
- Regras e estatística: anomalia de custo, queda de produtividade, ranking de talhões, comparações.

### Fase 11 — IoT
- Dispositivos, tokens, endpoint de ingestão, `sensor_readings` particionada, gráficos, alertas de sensor.
- Irrigação: registros e necessidades (automação só depois).

### Fase 12 — IA assistente
- LLM com tool calling sobre consultas seguras e escopadas por organização.
- Respostas mostram **dados usados, período, confiança e limitações**, e o aviso de validação por profissional.
- Avaliação com conjunto de perguntas reais (as do briefing) e métrica de acerto antes de liberar.

### Fase 13 — Escala empresarial
- Permissões avançadas, auditoria completa, integrações, planos e cobrança, observabilidade, desempenho.

### Fase 14 — Polimento e acessibilidade
- Auditoria de acessibilidade, animações, textos, desempenho (Core Web Vitals).

### Fase 15 — Preparação para produção e lançamento
- Teste de carga, backup e restauração testados, plano de incidentes, LGPD (política, termos, exportação/exclusão de dados), SEO das páginas públicas, monitoramento.

**Diferenças em relação ao seu roadmap original e por quê:**

| Mudança | Motivo |
|---|---|
| Culturas + safras juntas (Fase 4) | Culturas isoladas não entregam valor |
| Offline desde a Fase 5 | Registro acontece no campo; refazer depois custa caro |
| Custos nascem com operações | Custo é consequência da operação; construir separado duplica lógica |
| Dashboard só após ter dados (Fase 7) | Dashboard vazio decepciona; mas com layout definido desde o design system |
| Fitossanidade entra no MVP | É barata e é um motivo recorrente de uso do agrônomo |
| "Inteligência por regras" antes do LLM | Entrega valor cedo e valida as métricas que a IA vai explicar |
| IoT antes da IA | IA com contexto de sensor é melhor, mas depende do dado existir |
| Testes e segurança em toda fase | Não deixar para a Fase 16/17 |

## 21. Ordem ideal de implementação (resumo)

1. Fase 0 (decisões) → 2. Fundação → 3. Auth/organizações/isolamento → 4. Propriedades e talhões (mapa) → 5. Culturas e safras → 6. Operações/insumos/estoque + offline → 7. Colheita/produtividade/custos → 8. Dashboard/alertas/fitossanidade (**MVP**) → 9. Relatórios → 10. Clima → 11. Inteligência por regras → 12. IoT → 13. IA → 14. Escala → 15. Polimento → 16. Produção.

---

## Decisões que preciso de você (Fase 0)

1. **Nicho piloto:** qual cultura/região e que tamanho de produtor? (Isso muda catálogo, unidades e linguagem.)
2. **Perfil de entrada:** produtor, gestor ou agrônomo/consultor?
3. **Você tem produtores/agrônomos dispostos a testar?** Quantos?
4. **Pecuária** fica fora definitivamente, ou é para considerar depois?
5. **Aprova a stack?** (TypeScript, Next.js, NestJS, Postgres/PostGIS, Drizzle.) Os pontos marcados "confirmar em ADR" eu valido com um protótipo na Fase 1.
6. **Orçamento mensal de infraestrutura** aproximado e quem vai operar (só você?).
7. **Nome/marca:** checar disponibilidade de domínio e registro de "AgroNexus" no INPI antes de investir em identidade.

Aprovando o plano (ou ajustando), o próximo passo é a **Fase 0**: transformar estas decisões em ADRs e preencher `docs/vision.md`, `product.md`, `roadmap.md`, `architecture.md` e demais, para então começar a Fase 1.
