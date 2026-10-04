# Roadmap

Referência visual: as telas de conceito enviadas pela fundadora em 2026-10-04 (15 telas: site público, login, dashboard, propriedades, mapa, detalhes do talhão, safras, operações, insumos, clima, fitossanidade, custos, relatórios, assistente IA e app mobile). Cliente: produtor/gestor (ADR 0007).

Regra que vale para todas as telas: **número no painel só aparece se vier de dado registrado**. Os números das imagens de conceito são ilustrativos.

## Situação por tela

| # | Tela do conceito | Situação | O que falta |
|---|---|---|---|
| 1 | Página inicial pública | Não iniciada | Precisa de nome/marca/domínio decididos; textos sem números inventados |
| 2 | Login / cadastro | Não iniciada | Depende de servidor e provedor de login (fase de sincronização) |
| 3 | Dashboard | **Parcial** | Pronto: KPIs reais (área, produtividade, custo/ha, operações), Pede atenção, talhões, operações recentes, custos por tipo, produtividade por talhão. Falta: mapa, clima, comparação entre safras |
| 4 | Propriedades | **Pronto (básico)** | Foto da fazenda, busca |
| 5 | Mapa de talhões | Não iniciada | Desenhar/importar contorno (KML, GeoJSON), imagem de satélite exige internet |
| 6 | Detalhes do talhão | **Parcial** | Pronto: safra, achados, linha do tempo, operações, produtividade, custo. Falta: solo, altitude, declividade, abas, mapa |
| 7 | Safras | **Pronto (básico)** | Lista de safras com talhões, área, produtividade, custo/ha, operações abertas e progresso da colheita |
| 8 | Operações agrícolas | **Pronto** | Insumos usados (total ou dose/ha) ligados ao estoque |
| 9 | Insumos e estoque | **Pronto (básico)** | Pronto: cadastro, entrada com valor, contagem (ajuste), baixa automática quando a operação é concluída, previsto para operações abertas, "vai faltar", estoque mínimo, preço médio, planilha. Falta: estoque por depósito/fazenda, lote e validade |
| 10 | Clima | Parcial (chuva anotada) | Previsão exige internet e um serviço de clima (ex.: Open-Meteo, gratuito) |
| 11 | Fitossanidade | **Pronto (básico)** | Nível de infestação definido por quem registra (o app não calcula risco sem agrônomo validar) |
| 12 | Custos | **Pronto (básico)** | Pronto: custo realizado separado do previsto, por tipo, por hectare e por saca; despesas gerais (arrendamento, mão de obra, manutenção…); vendas, receita, preço médio, margem, ponto de equilíbrio (sc/ha e R$/sc), grão a vender; custo estimado dos insumos. Falta: evolução mês a mês, rateio de despesa por fazenda |
| 13 | Relatórios | **Parcial** | Pronto: relatório da visita (WhatsApp/PDF), relatório da safra (resumo, por talhão, custos, insumos, fitossanidade, chuva, comparação entre safras; WhatsApp/PDF), planilhas de visitas, operações e estoque. Falta: relatório por fazenda/período |
| 14 | Assistente IA | Não iniciada | ADR 0005: primeiro juntar fotos com diagnóstico confirmado; perguntas sobre os próprios dados vêm depois da sincronização |
| 15 | App mobile | **Pronto (PWA)** | Instalação na tela inicial e offline testados num celular real (precisa de hospedagem) |

## Ordem proposta

1. **Hospedagem de teste** (HTTPS) para usar no celular e mostrar a produtores. Valida o offline de verdade.
2. **Servidor, login e sincronização**: o gestor vê no celular dele o que o monitor registrou em outro. Destrava telas 2 e 14 e o uso por equipe.
3. ~~**Insumos e estoque** (9) ligados às operações.~~ Feito (básico).
4. **Mapa de talhões** (5) e área calculada pelo contorno.
5. **Clima** (10) com previsão.
6. ~~**Relatório da safra** (13) e comparação entre safras (3, 12).~~ Feito (básico).
7. **Página pública** (1), quando houver nome e marca.
8. **IA** (14), conforme ADR 0005.
