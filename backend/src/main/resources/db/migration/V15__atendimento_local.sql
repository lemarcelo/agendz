-- Atender (parte 5c): atendimento local (cliente do balcão, já concluído) e cadastro de cliente pelo atendimento.
-- Atendimento local pode não ter cadastro de cliente (só o nome digitado) e guarda o motivo quando é lançado depois do dia.
ALTER TABLE agendamento
  ALTER COLUMN cliente_id DROP NOT NULL,
  ADD COLUMN nome_avulso text CHECK (nome_avulso IS NULL OR char_length(nome_avulso) <= 100),
  ADD COLUMN motivo_retroativo text CHECK (motivo_retroativo IS NULL OR char_length(motivo_retroativo) BETWEEN 5 AND 300);

-- Cliente criado só com o telefone no atendimento: o nome fica igual ao telefone até alguém informar um (sem_nome).
ALTER TABLE cliente
  ADD COLUMN sem_nome boolean NOT NULL DEFAULT false,
  ADD COLUMN origem_cadastro text NOT NULL DEFAULT 'painel' CHECK (origem_cadastro IN ('painel', 'atendimento', 'whatsapp', 'link'));
