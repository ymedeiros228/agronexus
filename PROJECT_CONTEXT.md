# PROJECT_CONTEXT

## Estado atual
Fase 0 concluída em decisões. Início da Fase 1: aplicativo web (PWA) do caderno de monitoramento de soja, em `apps/web`, local-first (sem servidor ainda).

## Concluído
- Repositório e estrutura de docs.
- Análise profissional e Plano Mestre (docs/00_ANALISE_E_PLANO_MESTRE.md).
- ADRs 0001 a 0006 (docs/adr/).

## Decisões arquiteturais
- 0001 Nicho piloto: soja no Maranhão.
- 0002 Primeiro usuário: técnico/agrônomo que visita fazendas (hipótese a validar).
- 0003 Primeira fatia: caderno de monitoramento offline.
- 0004 Stack inicial: Next.js + IndexedDB (Dexie), app único; Postgres/PostGIS depois.
- 0005 IA: coletar fotos rotuladas primeiro, treinar depois.
- 0006 Não usar dados internos de empresas de terceiros.

## Pendente
- Orçamento mensal de hospedagem (não informado; assumido mínimo, planos gratuitos).
- Nome/marca/domínio/INPI.
- Testadores reais (pelo menos 3, perfis diferentes). Há uma estagiária de agronomia como porta de entrada.
- Escolha do provedor de PostgreSQL e da hospedagem (ADR futura).

## Problemas conhecidos
- Sem Docker nem PostgreSQL local nesta máquina; por isso o app começa local-first.
- Papel da IA de diagnóstico ainda é só intenção (ver ADR 0005).

## Próximas etapas
1. Criar apps/web (Next.js + Tailwind) e rodar localmente.
2. Construir o fluxo da visita com armazenamento local (IndexedDB).
3. Validar o fluxo com usuários reais.
4. Só então: servidor, login e sincronização.
