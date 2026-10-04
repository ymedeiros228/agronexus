# ADR 0007 — Cliente do produto: produtor / gestor da fazenda

- Status: aceita (2026-10-03). Substitui a ADR 0002.

## Contexto
A ADR 0002 partiu da hipótese de que o primeiro usuário seria o técnico ou agrônomo que visita fazendas, porque a porta de entrada para testes é uma estagiária de agronomia que vai às fazendas. A fundadora esclareceu: essa pessoa é quem ajuda a validar e a chegar nos produtores, mas o **foco do produto é o produtor / gestor**, quem precisa ter a informação da lavoura na mão para decidir.

## Decisão
- O cliente e usuário principal é o **produtor ou gestor da fazenda** (dono, gerente, administrador).
- Quem registra no campo pode ser o próprio produtor, o gerente, o monitor de pragas da fazenda ou um consultor contratado. A informação pertence à fazenda.
- Agrônomos e técnicos continuam importantes como quem registra e como quem valida o conteúdo agronômico.

## Consequências
- A tela inicial vira um **painel do gestor**: como está cada talhão (estágio, dias após o plantio, última visita, últimos achados, chuva) e o que pede atenção (retorno atrasado, talhão há muitos dias sem visita).
- O caderno de monitoramento (ADR 0003) continua sendo a base: é ele que alimenta o painel.
- Para o gestor ver o que outra pessoa registrou em outro celular, é preciso **servidor, login e sincronização**. Enquanto isso não existe, a ponte é o relatório da visita compartilhado pelo WhatsApp e o backup.
- Ganham prioridade no roteiro, depois da sincronização, os registros de gestão do produtor: aplicações feitas, colheita e produtividade por talhão, e custos por safra.
- O limite de 7 dias para avisar "talhão sem visita" é um padrão inicial, a validar com agrônomo e produtores.
- A venda é para a fazenda (por área ou por fazenda), não para o técnico.
