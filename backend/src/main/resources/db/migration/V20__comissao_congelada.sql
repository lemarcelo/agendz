-- 5d-4b: comissão congelada por atendimento, pagamento, cancelamento e lançamento atrasado.
-- O percentual do SERVIÇO é gravado na linha quando o atendimento é criado (mudar a regra depois não mexe no que já foi combinado); linhas antigas
-- (anteriores a esta migração) ficam nulas e são congeladas na primeira leitura da comissão, pelas regras daquele momento.
-- O percentual do PRODUTO já era congelado na V19 (`agendamento_produto.comissao_pct`).
-- Cada linha pertence a um beneficiário: o serviço é do profissional do atendimento; o produto é do `vendedor_id`. Pagar ou cancelar marca todas as linhas dele
-- num atendimento. Comissão paga nunca se cancela, e o pagamento (`comissao_pagamento`) guarda o valor e o período; não há financeiro no servidor ainda,
-- então a despesa "Comissões" só será lançada quando o financeiro real existir.
CREATE TABLE comissao_pagamento (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id         uuid NOT NULL REFERENCES loja (id),
  beneficiario_id uuid NOT NULL,
  de              timestamptz NOT NULL,          -- início do período (inclusive)
  ate             timestamptz NOT NULL,          -- fim do período (exclusive)
  valor           numeric(12,2) NOT NULL CHECK (valor > 0 AND valor <= 10000000),
  atendimentos    integer NOT NULL CHECK (atendimentos > 0),
  em              timestamptz NOT NULL DEFAULT now(),
  autor_id        uuid,
  CHECK (ate > de),
  UNIQUE (loja_id, id),
  FOREIGN KEY (loja_id, beneficiario_id) REFERENCES usuario (loja_id, id)
);
CREATE INDEX comissao_pagamento_beneficiario ON comissao_pagamento (loja_id, beneficiario_id, de);

ALTER TABLE agendamento
  ADD COLUMN comissao_em timestamptz;            -- lançamento atrasado de período já pago: a comissão entra no próximo pagamento (conta nesta data)

ALTER TABLE agendamento_servico
  ADD COLUMN comissao_pct numeric(5,2) CHECK (comissao_pct IS NULL OR (comissao_pct >= 0 AND comissao_pct <= 100)),
  ADD COLUMN comissao_pagamento_id uuid,
  ADD COLUMN comissao_cancelada_motivo text CHECK (comissao_cancelada_motivo IS NULL OR char_length(comissao_cancelada_motivo) <= 300),
  ADD COLUMN comissao_cancelada_em timestamptz,
  ADD COLUMN comissao_cancelada_por uuid,
  ADD FOREIGN KEY (loja_id, comissao_pagamento_id) REFERENCES comissao_pagamento (loja_id, id);

ALTER TABLE agendamento_produto
  ADD COLUMN comissao_pagamento_id uuid,
  ADD COLUMN comissao_cancelada_motivo text CHECK (comissao_cancelada_motivo IS NULL OR char_length(comissao_cancelada_motivo) <= 300),
  ADD COLUMN comissao_cancelada_em timestamptz,
  ADD COLUMN comissao_cancelada_por uuid,
  ADD FOREIGN KEY (loja_id, comissao_pagamento_id) REFERENCES comissao_pagamento (loja_id, id);

ALTER TABLE comissao_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE comissao_pagamento FORCE ROW LEVEL SECURITY;
CREATE POLICY comissao_pagamento_da_loja ON comissao_pagamento
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);

GRANT SELECT, INSERT ON comissao_pagamento TO agendz_app;
