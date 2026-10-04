# PROJECT_CONTEXT

## Estado atual
Fase 1 em andamento. App web (PWA) em `apps/web`, local-first (dados no IndexedDB do aparelho, sem servidor). **Cliente: produtor/gestor** (ADR 0007). Referência visual e situação de cada tela: `docs/roadmap.md`.

Rodar localmente (a partir de `apps/web`):
- Desenvolvimento: `npm run dev`
- Produção (necessária para o service worker): `npm run build` e depois `npx next start -p 3100`
- Conferência: `npx tsc --noEmit`, `npx eslint`, `npm test` (Vitest, 37 testes)

## Concluído
- Repositório, docs, Plano Mestre, ADRs 0001 a 0007, roadmap por tela.
- App em `apps/web` (Next.js 16, Tailwind 4, Dexie 4, lucide-react):
  - **Painel do gestor**: KPIs da safra só com dados registrados (área, produtividade sc/ha, custo/ha, operações abertas), "Pede atenção" (retorno atrasado, operação atrasada, talhão sem visita), situação de cada talhão, operações recentes, custos por tipo, produtividade por talhão, seletor de safra.
  - **Layout**: barra lateral verde no computador; no celular, barra inferior com ícones e botão + (visita ou operação).
  - **Fazendas e talhões**: cadastrar, editar, remover (exclusão lógica em cascata). Página do talhão com safra atual, nova safra, achados da safra, operações, linha do tempo e safras anteriores.
  - **Monitoramento**: visita com estágio, achados, fotos com diagnóstico e GPS, recomendação, retorno; editar visita; relatório (WhatsApp/PDF); tela de ocorrências e lista de visitas.
  - **Operações**: preparo, plantio, adubação, aplicação, colheita, outro; planejada/em andamento/concluída; área, custo, sacas colhidas (produtividade); atalho para concluir; plantio concluído preenche a data de plantio vazia da safra.
  - **Dados**: backup JSON (com fotos e operações), restauração que só mescla, lembrete de backup no painel, planilha CSV, armazenamento persistente.
  - Banco local na versão 3 (v2: safra na visita, tabela meta; v3: operações). Migração v1→v2 verificada no navegador com dados reais de teste.
- Tipos, lint, testes e build passam. Todas as páginas são estáticas.

## Decisões arquiteturais
- 0001 Nicho piloto: soja no Maranhão.
- 0002 (substituída pela 0007).
- 0003 Primeira fatia: caderno de monitoramento offline.
- 0004 Stack inicial: Next.js + IndexedDB (Dexie), app único; Postgres/PostGIS depois.
- 0005 IA: coletar fotos rotuladas primeiro, treinar depois.
- 0006 Não usar dados internos de empresas de terceiros.
- 0007 Cliente: produtor/gestor; quem registra pode ser ele, gerente, monitor ou consultor.
- Rotas dinâmicas usam query string (`/visita?id=...`) para serem estáticas e funcionarem offline.
- Números digitados seguem o padrão brasileiro (`15.000` = quinze mil; `1.250,50`).

## Padrões a validar com agrônomo e produtores
- Aviso de talhão sem visita: mais de 7 dias (`NO_VISIT_ALERT_DAYS`).
- Não cobra visita depois de 150 dias do plantio ou com estágio R8 (`MAX_CYCLE_DAYS`).
- Catálogo de estágios, pragas e doenças é preliminar; sem níveis de ação nem recomendação de produto.

## Pendente
- **Hospedagem de teste (HTTPS)**: necessária para testar no celular e o offline real (o navegador embutido não registra service worker). Opções levantadas em 2026-10-04, aguardando escolha da fundadora.
- Servidor, login e sincronização (para o gestor ver o que outra pessoa registrou).
- Orçamento mensal (não informado). Nome/marca/domínio/INPI.
- Testadores reais (pelo menos 3). A irmã da fundadora (estagiária de agronomia) é a porta de entrada para produtores.
- `npm audit`: 5 vulnerabilidades altas na cadeia do ESLint (só desenvolvimento); corrigir com `--force` rebaixaria o eslint-config-next.

## Problemas conhecidos
- Sem Docker nem PostgreSQL local nesta máquina.
- Dados só existem no aparelho até haver sincronização; backup é manual.
- No navegador embutido do Claude Code, capturas de tela às vezes saem cortadas; a medição pelo DOM confirma que o layout está certo.

## Próximas etapas
Ver `docs/roadmap.md` ("Ordem proposta").
