# ADR 0004 — Stack inicial

- Status: aceita (2026-10-03). Substitui, para a primeira fatia, a proposta de monorepo com API separada do Plano Mestre.

## Contexto
Quem opera o produto é uma pessoa só. Menos peças significam menos o que operar e quebrar. O ambiente de desenvolvimento tem Node 24 e npm, mas não tem Docker nem PostgreSQL local.

## Decisão
- **TypeScript** em tudo.
- **Next.js (App Router)** como app único em `apps/web`, instalável como PWA.
- **IndexedDB (via Dexie)** como armazenamento local primário no celular. Todo registro tem UUID gerado no cliente, para a sincronização futura ser idempotente.
- **PostgreSQL + PostGIS** no servidor, quando a fase de sincronização começar. O provedor gerenciado será escolhido em ADR própria.
- **npm** como gerenciador de pacotes. Monorepo, pnpm e API separada (NestJS) ficam adiados até haver motivo concreto.

## Consequências
- O app pode ser desenvolvido e demonstrado sem servidor.
- Sincronização, login e banco central ficam para uma fase seguinte.
- Se a API separada se mostrar necessária, extrai-se depois; o código é organizado por módulos para permitir isso.
