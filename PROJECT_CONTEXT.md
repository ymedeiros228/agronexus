# PROJECT_CONTEXT

## Estado atual
Fase 1 em andamento. Existe um app web (PWA) em `apps/web` com o fluxo completo da visita de monitoramento de soja, local-first (dados no IndexedDB do aparelho, sem servidor).

Rodar localmente (a partir de `apps/web`):
- Desenvolvimento: `npm run dev`
- Produção (necessária para o service worker): `npm run build` e depois `npx next start -p 3100`
- Conferência: `npx tsc --noEmit`, `npx eslint`

## Concluído
- Repositório, estrutura de docs, Plano Mestre, ADRs 0001 a 0006.
- App em `apps/web` (Next.js 16, Tailwind 4, Dexie):
  - Fazendas e talhões (com safra, cultivar e data de plantio; mostra dias após o plantio).
  - Visita: estágio V/R, achados (praga, doença, daninha), fotos com diagnóstico confirmado e GPS, observações, recomendação, retorno combinado.
  - Relatório da visita: compartilhar (WhatsApp/área de transferência), imprimir/PDF, marcar retorno como feito.
  - Registro de chuva por fazenda.
  - Início com retornos pendentes e últimas visitas.
  - Fotos comprimidas no aparelho antes de salvar.
  - PWA: manifesto, ícones, service worker (`public/sw.js`), aviso de "sem internet".
- Verificado no navegador embutido: cadastro de fazenda e talhão, visita completa com foto, persistência no IndexedDB, relatório.
- Tipos, lint e build de produção passam. Todas as páginas são estáticas.

## Decisões arquiteturais
- 0001 Nicho piloto: soja no Maranhão.
- 0002 Primeiro usuário: técnico/agrônomo que visita fazendas (hipótese a validar).
- 0003 Primeira fatia: caderno de monitoramento offline.
- 0004 Stack inicial: Next.js + IndexedDB (Dexie), app único; Postgres/PostGIS depois.
- 0005 IA: coletar fotos rotuladas primeiro, treinar depois.
- 0006 Não usar dados internos de empresas de terceiros.
- Rotas dinâmicas usam query string (`/visita?id=...`, `/fazenda?id=...`) para serem páginas estáticas e funcionarem offline.

## Pendente
- **Teste real do offline**: o navegador embutido do Claude Code não registra service workers, então o cache do shell do app NÃO foi verificado. Testar num Chrome/celular. Service worker exige HTTPS (ou localhost), então o teste no celular pede um deploy.
- Catálogo agronômico (estágios, pragas, doenças) é preliminar e precisa de revisão de um agrônomo.
- Orçamento mensal de hospedagem (não informado).
- Nome/marca/domínio/INPI.
- Testadores reais (pelo menos 3, perfis diferentes). Há uma estagiária de agronomia como porta de entrada.
- Servidor, login e sincronização (próxima fase); escolha do provedor de PostgreSQL e hospedagem (ADR futura).
- Exportar/fazer backup dos dados locais (hoje, se o usuário limpar os dados do navegador, perde tudo).
- `npm audit` aponta 5 vulnerabilidades altas, todas na cadeia do ESLint (só desenvolvimento). Corrigir com `--force` rebaixaria o eslint-config-next, então ficou como está.

## Problemas conhecidos
- Sem Docker nem PostgreSQL local nesta máquina.
- Dados só existem no aparelho até haver sincronização.
- IA de diagnóstico é só intenção (ADR 0005).

## Próximas etapas
1. Testar em celular de verdade (deploy de teste) e validar o fluxo com a primeira pessoa do campo.
2. Backup/exportação dos dados locais.
3. Servidor, login e sincronização idempotente.
