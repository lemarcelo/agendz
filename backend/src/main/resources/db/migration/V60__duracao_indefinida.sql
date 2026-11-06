-- F: serviço de duração indefinida ("combinar agendamento").
-- servico.duracao_min nulo = duração indefinida: o horário se combina por WhatsApp (link do cliente) ou o profissional marca os blocos que quiser (Atender).
-- O preço do serviço indefinido pode ser um valor, uma lista de valores (cada um com a sua descrição) ou um intervalo (de preco a preco_max);
-- o valor final é lançado no Atender (agendamento_servico.preco guarda o valor lançado, e é sobre ele que a comissão incide).
-- Quem combina: os usuários marcados em combina_ids (o WhatsApp do primeiro com telefone); sem ninguém, o WhatsApp do estabelecimento (configuracao_loja.whatsapp_loja).
ALTER TABLE servico ALTER COLUMN duracao_min DROP NOT NULL;
ALTER TABLE servico
  ADD COLUMN duracao_texto text CHECK (duracao_texto IS NULL OR char_length(duracao_texto) <= 120),
  ADD COLUMN combinar_msg  text CHECK (combinar_msg IS NULL OR char_length(combinar_msg) <= 300),
  ADD COLUMN preco_modo    text NOT NULL DEFAULT 'fixo' CHECK (preco_modo IN ('fixo', 'lista', 'faixa')),
  ADD COLUMN preco_opcoes  jsonb,
  ADD COLUMN preco_max     numeric(10,2) CHECK (preco_max IS NULL OR (preco_max >= 0 AND preco_max <= 100000)),
  ADD COLUMN combina_ids   uuid[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT servico_indefinido_ck CHECK (duracao_min IS NOT NULL OR (NOT multi_dia AND NOT combo));
-- Serviço de duração fixa nunca guarda texto, lista nem faixa de preço.
ALTER TABLE servico ADD CONSTRAINT servico_fixo_sem_combinar_ck
  CHECK (duracao_min IS NULL OR (duracao_texto IS NULL AND combinar_msg IS NULL AND preco_modo = 'fixo' AND preco_opcoes IS NULL AND preco_max IS NULL AND combina_ids = '{}'));

-- WhatsApp geral do estabelecimento (55 + DDD + número): destino do "Combinar agendamento" quando ninguém do serviço tem telefone; a troca de plano cai nele se o dela estiver vazio.
ALTER TABLE configuracao_loja
  ADD COLUMN whatsapp_loja text CHECK (whatsapp_loja IS NULL OR whatsapp_loja ~ '^[0-9]{12,13}$');

-- Item de agendamento de serviço indefinido guarda duração 0 (a ocupação vem dos blocos do agendamento).
