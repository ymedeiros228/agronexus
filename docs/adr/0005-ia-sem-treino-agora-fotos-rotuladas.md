# ADR 0005 — IA: coletar fotos rotuladas primeiro, treinar depois

- Status: aceita (2026-10-03)

## Contexto
Detectar doença por foto é desejado. Um modelo bom precisa de milhares de fotos de campo identificadas por agrônomo. Bases públicas costumam ter fotos de folha em fundo limpo, que funcionam mal na lavoura. Um diagnóstico errado leva a uma aplicação errada, o que custa dinheiro ao produtor.

## Decisão
1. O caderno coleta fotos com talhão, data, estágio, GPS e o **diagnóstico confirmado pelo técnico**.
2. Depois, a IA apenas **sugere** ("possível ferrugem, confirme"), sempre com revisão humana, usando modelo de visão existente. Só se mostra ao usuário após medir o acerto nas fotos coletadas.
3. Modelo próprio só se o acerto medido justificar.

## Consequências
- Termo de uso e LGPD devem prever o uso das fotos para treinamento, com autorização do cliente, desde o dia 1.
- A foto guarda o rótulo do técnico, e não apenas a imagem.
- Nenhuma tela promete diagnóstico automático nesta fatia.
