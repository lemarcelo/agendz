-- 5d-3: o assistente de início e o Reconfigurar passam a cuidar de produtos e da comissão geral. A reconfiguração guarda também o que mudou aí,
-- para o "Desfazer": produtos criados são DESATIVADOS (nunca excluídos) e a comissão geral volta ao valor de antes (null = sem valor gravado, vale 50).
ALTER TABLE reconfiguracao
  ADD COLUMN produtos_criados  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN comissao_trocada  boolean NOT NULL DEFAULT false,
  ADD COLUMN comissao_antes    numeric(5,2) CHECK (comissao_antes IS NULL OR (comissao_antes >= 0 AND comissao_antes <= 100)),
  ADD COLUMN comissao_depois   numeric(5,2) CHECK (comissao_depois IS NULL OR (comissao_depois >= 0 AND comissao_depois <= 100));
