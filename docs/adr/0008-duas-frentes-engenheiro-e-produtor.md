# ADR 0008 — Duas frentes: engenheiro agrônomo e produtor

- Status: aceita (2026-10-28). Complementa a ADR 0007 e retoma a ADR 0002 como uma das frentes.

## Contexto
A ADR 0002 escolheu o técnico/agrônomo como primeiro usuário; a ADR 0007 trocou o foco para o produtor/gestor, que decide e paga. Na prática os dois usam a mesma informação de lados diferentes: o engenheiro agrônomo visita várias fazendas, registra o que viu e recomenda; o produtor precisa ver isso junto com operações, estoque e custos para decidir. O Plano Mestre já apontava o agrônomo como canal de distribuição (§4), o "modo consultor" (§10) e o "plano consultor" (§12).

## Decisão
O produto tem **duas frentes sobre o mesmo dado da fazenda**:

1. **Frente do engenheiro**: carteira de fazendas atendidas (de donos diferentes), agenda de visitas e retornos, visita de monitoramento offline, relatório da visita com a identificação profissional dele.
2. **Frente do produtor**: painel do gestor, fazendas, mapa, operações, insumos, safras, financeiro e relatórios (o que existe hoje).

Regras:
- A informação continua **pertencendo à fazenda** (ADR 0007). O engenheiro trabalha dentro da fazenda do cliente.
- Com servidor e login, o produtor **convida** o engenheiro e pode **tirar o acesso**. O engenheiro só vê as fazendas que atende.
- A visita do engenheiro aparece no painel do produtor. A recomendação pode virar operação planejada, mas quem decide é o produtor.
- O app **registra** a recomendação do engenheiro; não prescreve produto, dose nem gera receita agronômica.
- Um app só, com as duas frentes (ADR 0004): mesmo banco, mesmo deploy. A separação por modo ou papel é de navegação, não de código.

## Consequências
- Enquanto não houver sincronização, a frente do engenheiro funciona no aparelho dele: ele cadastra as fazendas dos clientes (o campo "dono" da fazenda identifica o cliente) e manda o relatório por WhatsApp/PDF.
- A primeira entrega da frente do engenheiro é local: **agenda de retornos** de todas as fazendas e **identificação profissional** (nome, CREA, empresa) no relatório da visita.
- A fase de servidor ganha um requisito explícito: usuário em várias organizações com papel "agrônomo" (`memberships`, Plano Mestre §15).
- Testadores: pelo menos um engenheiro e um produtor entre os três primeiros.
- Em aberto: se o engenheiro vê o financeiro do cliente; se pode cadastrar a fazenda de quem ainda não usa o app e entregá-la depois; o que ele leva quando deixa de atender uma fazenda; quem paga no piloto.
