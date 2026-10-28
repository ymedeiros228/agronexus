# ADR 0002 — Primeiro usuário: técnico ou agrônomo que visita fazendas

- Status: substituída pela ADR 0007 (2026-10-03). O cliente é o produtor / gestor; o técnico é quem registra ou valida.
- Retomada pela ADR 0008 (2026-10-28) como uma das duas frentes do produto (engenheiro agrônomo e produtor).

## Contexto
A soja do Maranhão é feita em fazendas grandes, com monitoramento de pragas e doenças feito em visitas. Quem visita precisa registrar o que viu, recomendar e voltar para acompanhar. O produtor recebe o resultado, mas quem preenche é o técnico.

## Decisão
O primeiro usuário é o **técnico ou agrônomo** (de consultoria, revenda, cooperativa ou independente). O produtor é quem recebe o relatório da visita.

## Consequências
- O fluxo principal é a visita de monitoramento, feita no celular, em campo.
- Offline é requisito, não opcional.
- A venda, mais adiante, pode ser para o técnico ou para a empresa dele (várias fazendas de uma vez).
- Precisa de pelo menos 3 testadores reais, de perfis diferentes, antes de fechar esta decisão.
