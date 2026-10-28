-- 5d-4c-1: forma de pagamento do atendimento local e regras do Atender (padrão da loja + campos obrigatórios).
-- Sem linha/valor = fábrica: forma padrão Pix; obrigatórios do futuro = nome e telefone; do local = nenhum.
-- campos_* guardam a lista separada por vírgula (vazio = nenhum campo obrigatório; NULL = padrão de fábrica).
ALTER TABLE configuracao_loja
  ADD COLUMN forma_pagamento_padrao text CHECK (forma_pagamento_padrao IS NULL OR forma_pagamento_padrao IN ('', 'pix', 'dinheiro', 'cartao')),
  ADD COLUMN campos_futuro text CHECK (campos_futuro IS NULL OR length(campos_futuro) <= 100),
  ADD COLUMN campos_local  text CHECK (campos_local IS NULL OR length(campos_local) <= 100);

-- Só o atendimento local guarda a forma (agendamento futuro ainda não foi pago). Registro apenas: não há financeiro no servidor.
ALTER TABLE agendamento
  ADD COLUMN forma_pagamento text CHECK (forma_pagamento IS NULL OR forma_pagamento IN ('pix', 'dinheiro', 'cartao'));
