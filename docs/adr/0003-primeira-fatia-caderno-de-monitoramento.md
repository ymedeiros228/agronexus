# ADR 0003 — Primeira fatia: caderno de monitoramento offline

- Status: aceita (2026-10-03)

## Contexto
O Plano Mestre tem 16 fases. A primeira entrega precisa ser testável no campo durante o pico de monitoramento da soja (aproximadamente dezembro a março), por isso precisa ser pequena.

## Decisão
A primeira fatia é o **fluxo completo de uma visita**:
1. Fazenda e talhão.
2. Safra do talhão: cultivar, data de plantio e estágio.
3. Visita de monitoramento: contagem de praga, foto com diagnóstico, observação, recomendação.
4. Relatório da visita para o produtor.
5. Registro de chuva.
6. Tudo funcionando sem internet.

## Fora desta fatia
IA, custos, estoque, financeiro, sensores, cobrança, dashboards avançados.

## Consequências
- O trabalho offline (armazenamento local e sincronização) é o ponto mais arriscado e começa primeiro.
- O servidor e o login entram depois que o fluxo local estiver validado com usuários.
