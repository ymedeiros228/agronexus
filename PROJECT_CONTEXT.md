# PROJECT_CONTEXT

## Estado atual
Fase 1 em andamento. App web (PWA) em `apps/web`, local-first (dados no IndexedDB do aparelho, sem servidor). **Duas frentes sobre o mesmo dado** (ADR 0008): o engenheiro agrônomo registra e recomenda no campo; o produtor/gestor vê, decide e controla o dinheiro (dono do dado, ADR 0007). Referência visual e situação de cada tela: `docs/roadmap.md`.

Rodar localmente (a partir de `apps/web`):
- Desenvolvimento: `npm run dev`
- Produção (necessária para o service worker): `npm run build` e depois `npx next start -p 3100`
- Conferência: `npx tsc --noEmit`, `npx eslint`, `npm test` (Vitest, 110 testes)

## Concluído
- Repositório, docs, Plano Mestre, ADRs 0001 a 0008, roadmap por tela.
- App em `apps/web` (Next.js 16, Tailwind 4, Dexie 4, lucide-react):
  - **Painel do gestor**: KPIs da safra só com dados registrados (área, produtividade sc/ha, custo/ha, operações abertas), "Pede atenção" (retorno atrasado, operação atrasada, talhão sem visita), situação de cada talhão, operações recentes, custos por tipo, produtividade por talhão, seletor de safra.
  - **Layout**: barra lateral verde no computador; no celular, barra inferior (Painel, Operações, +, Monitorar, Mais) e botão + (visita, operação ou entrada de insumo).
  - **Fazendas e talhões**: cadastrar, editar, remover (exclusão lógica em cascata). Página do talhão com safra atual, nova safra, achados da safra, operações, linha do tempo e safras anteriores.
  - **Monitoramento**: visita com estágio, achados, fotos com diagnóstico e GPS, recomendação, retorno; editar visita; relatório (WhatsApp/PDF); tela de ocorrências e lista de visitas.
  - **Operações**: preparo, plantio, adubação, aplicação, colheita, outro; planejada/em andamento/concluída; área, custo, sacas colhidas (produtividade); atalho para concluir; plantio concluído preenche a data de plantio vazia da safra.
  - **Insumos e estoque**: cadastro (nome do produtor, categoria, unidade, estoque mínimo), entrada com valor pago, contagem que lança a diferença como ajuste, insumos na operação (total ou dose por hectare), baixa só quando a operação é concluída, "previsto" para operações abertas, aviso "vai faltar"/estoque baixo/saldo negativo no painel, preço médio das entradas, sugestão de custo da operação pelos insumos. Insumo usado em operação não pode ser excluído.
  - **Safras e relatório da safra**: lista de safras com progresso da colheita; relatório com área, produção, produtividade, custo realizado, custo/ha, custo por saca, por talhão, custo por tipo, insumos usados, fitossanidade, chuva do ano agrícola e comparação entre safras; compartilhar (WhatsApp) e PDF.
  - **Custo realizado x previsto**: só operação concluída ou em andamento entra no custo; planejada aparece como "previsto".
  - **Financeiro da safra**: vendas (sacas, preço líquido, comprador), despesas gerais por categoria, receita, custo total (operações + despesas), margem e margem/ha, ponto de equilíbrio (sc/ha ao preço médio e R$/sc com a produtividade), grão produzido/vendido/a vender, composição do custo. Entra no painel (custo/ha), no relatório e na comparação entre safras.
  - **Mapa de talhões** (com satélite da Esri guardado no aparelho para abrir offline): contorno caminhando com GPS (filtra precisão pior que 25 m e pontos a menos de 5 m; tela fica ligada onde o navegador deixa), desenhado com toques sobre o satélite ou importado de KML/KMZ/GeoJSON; área e perímetro pelo contorno, botão para usar como área do talhão; mapa da fazenda colorido pela situação; rota até o talhão (abre o app de mapas); exportação KML.
  - **Dados**: backup JSON de todas as tabelas (lista única em `backup.ts`), restauração que só mescla, lembrete de backup no painel, planilhas CSV (visitas, operações com insumos, estoque, vendas e despesas), armazenamento persistente.
  - Banco local na versão 6 (v2: safra na visita, tabela meta; v3: operações; v4: insumos e movimentos de estoque; v5: vendas e despesas; v6: rótulo da safra padronizado). Migrações até a v5 verificadas no navegador com dados de teste; a v6 só nos testes.
  - Rótulo da safra sempre no formato `2026/27` (aceita digitar `2026/2027`, `26/27`, `2026-27`), para vendas e despesas não se dividirem em safras diferentes.
  - Áreas e chuva digitadas seguem o padrão brasileiro (`parseNumberBR`).
  - Exclusão em cascata completa: visita leva achados e fotos; talhão leva safras, visitas e operações; fazenda leva tudo.
  - Restauração de backup ignora registro sem os campos obrigatórios e padroniza o rótulo da safra.
  - Backup é montado em partes (uma foto por vez) para não estourar o limite de texto do navegador. A restauração lê o arquivo em pedaços de 1 MB (`json-stream.ts`): tabelas numa transação, fotos em lotes de 20.
  - `sw.test.ts` falha se a lista `PAGES` de `public/sw.js` não bater com as páginas de `src/app`. Ao mudar arquivos pré-carregados, subir a versão `CACHE`.
  - Visual: painel abre com faixa verde (saudação, data, safra, pendências); primeira tela é boas-vindas com os 3 passos. Nome do talhão via `plotLabel` (não repete "Talhão"); rótulos do mapa encolhem para caber no contorno. Grades sem colunas base usam `grid-cols-1` para não estourar a largura no celular.
- Tipos, lint, testes e build passam. Todas as páginas são estáticas.

## Decisões arquiteturais
- 0001 Nicho piloto: soja no Maranhão.
- 0002 (substituída pela 0007).
- 0003 Primeira fatia: caderno de monitoramento offline.
- 0004 Stack inicial: Next.js + IndexedDB (Dexie), app único; Postgres/PostGIS depois.
- 0005 IA: coletar fotos rotuladas primeiro, treinar depois.
- 0006 Não usar dados internos de empresas de terceiros.
- 0007 Cliente: produtor/gestor; quem registra pode ser ele, gerente, monitor ou consultor.
- 0008 Duas frentes: engenheiro agrônomo e produtor, num app só, sobre o mesmo dado da fazenda.
- Rotas dinâmicas usam query string (`/visita?id=...`) para serem estáticas e funcionarem offline.
- Números digitados seguem o padrão brasileiro (`15.000` = quinze mil; `1.250,50`).

## Padrões a validar com agrônomo e produtores
- Aviso de talhão sem visita: mais de 7 dias (`NO_VISIT_ALERT_DAYS`).
- Não cobra visita depois de 150 dias do plantio ou com estágio R8 (`MAX_CYCLE_DAYS`).
- Catálogo de estágios, pragas e doenças é preliminar; sem níveis de ação nem recomendação de produto.
- Estoque é um só para a conta (não separa por fazenda/depósito). Preço médio = valor pago nas entradas ÷ quantidade dessas entradas (média simples, não móvel).
- Uso de insumo de operação planejada não baixa o saldo; aparece como "previsto".
- Ano agrícola da safra: 1º de julho a 30 de junho (chuva do relatório usa esse período).
- Custo por saca = custo por hectare ÷ produtividade (funciona mesmo com colheita parcial).
- Vendas e despesas ficam na safra (rótulo), não por fazenda/talhão. Margem = vendas lançadas − custo realizado; sem venda, não há margem.

## Pendente
- **Hospedagem de teste (HTTPS)**: necessária para testar no celular e o offline real (o navegador embutido não registra service worker). Opções levantadas em 2026-10-04, aguardando escolha da fundadora.
- Servidor, login e sincronização (para o gestor ver o que outra pessoa registrou).
- Orçamento mensal (não informado). Nome/marca/domínio/INPI.
- Testadores reais (pelo menos 3). A irmã da fundadora (estagiária de agronomia) é a porta de entrada para produtores.
- `npm audit`: 5 vulnerabilidades altas na cadeia do ESLint (só desenvolvimento); corrigir com `--force` rebaixaria o eslint-config-next.

## Não verificado
- Gravação do contorno com GPS de verdade no campo (testado no navegador com posições simuladas). No celular, o navegador pode parar o GPS se a tela apagar.

## Problemas conhecidos
- Sem Docker nem PostgreSQL local nesta máquina.
- Dados só existem no aparelho até haver sincronização; backup é manual.
- No navegador embutido do Claude Code, capturas de tela às vezes saem cortadas; a medição pelo DOM confirma que o layout está certo.

## Próximas etapas
Ver `docs/roadmap.md` ("Plano de 28/10/2026"). Next 16.4.3 desde 28/10 (corrigiu 3 falhas de segurança da 16.3.8).
