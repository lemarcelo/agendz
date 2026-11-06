-- V56 (bloco B1): atendimento dividido entre profissionais. Quando os serviços de um mesmo pedido são de profissionais diferentes, o servidor cria UM agendamento por
-- profissional (em sequência: a duração soma) e liga todos pelo mesmo `grupo_id`. Cada agendamento continua com UM profissional, então conflito, escala, ausência,
-- comissão (de cada serviço para quem o fez), relatórios e planos seguem valendo por agendamento. Agendamentos que já existem ficam com `grupo_id` nulo.
ALTER TABLE agendamento ADD COLUMN grupo_id uuid;
CREATE INDEX agendamento_grupo ON agendamento (loja_id, grupo_id) WHERE grupo_id IS NOT NULL;
