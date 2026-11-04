-- V54: Cliente parceiro e comissão sobre parceiros
-- Permite marcar clientes como parceiros com desconto percentual ou abono total (100%),
-- e configurar se atendimentos de parceiros geram comissão para os profissionais.

ALTER TABLE cliente
  ADD COLUMN IF NOT EXISTS parceiro boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parceiro_desconto_pct numeric(5,2)
  CHECK (parceiro_desconto_pct IS NULL OR (parceiro_desconto_pct >= 0 AND parceiro_desconto_pct <= 100));

ALTER TABLE configuracao_loja
  ADD COLUMN IF NOT EXISTS comissao_parceiro boolean NOT NULL DEFAULT false;
