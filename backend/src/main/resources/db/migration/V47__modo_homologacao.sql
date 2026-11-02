-- B1: Modo homologacao por cliente (loja)
-- Permite testar o sistema numa loja real sem sujar dados reais.
-- Quando o modo esta desligado, lancamentos com teste = true ficam invisiveis para a aplicacao via RLS.

CREATE TABLE loja_homologacao (
  loja_id                 uuid PRIMARY KEY REFERENCES loja(id) ON DELETE CASCADE,
  ativo                   boolean NOT NULL DEFAULT false,
  sessao_atual            integer NOT NULL DEFAULT 0,
  ativado_em              timestamptz,
  ativado_por             text,
  motivo                  text,
  configuracoes_snapshot  jsonb
);

ALTER TABLE agendamento ADD COLUMN teste boolean NOT NULL DEFAULT false;
ALTER TABLE agendamento ADD COLUMN teste_sessao integer;
CREATE INDEX idx_agendamento_teste ON agendamento (loja_id, teste);

ALTER TABLE agendamento_servico ADD COLUMN teste boolean NOT NULL DEFAULT false;
ALTER TABLE agendamento_produto ADD COLUMN teste boolean NOT NULL DEFAULT false;
ALTER TABLE agendamento_evento ADD COLUMN teste boolean NOT NULL DEFAULT false;

ALTER TABLE cliente ADD COLUMN teste boolean NOT NULL DEFAULT false;
ALTER TABLE cliente ADD COLUMN teste_sessao integer;
CREATE INDEX idx_cliente_teste ON cliente (loja_id, teste);

-- Remove a unicidade rigida que incluiria clientes de teste e cria indice unico apenas para registros reais
ALTER TABLE cliente DROP CONSTRAINT IF EXISTS cliente_telefone_nome_uq;
DROP INDEX IF EXISTS cliente_telefone_nome_uq;
CREATE UNIQUE INDEX IF NOT EXISTS cliente_telefone_nome_uq ON cliente (loja_id, telefone_hash, nome_chave) WHERE (teste = false);

ALTER TABLE movimento_estoque ADD COLUMN teste boolean NOT NULL DEFAULT false;
ALTER TABLE movimento_estoque ADD COLUMN teste_sessao integer;

ALTER TABLE comissao_pagamento ADD COLUMN teste boolean NOT NULL DEFAULT false;
ALTER TABLE aviso_painel ADD COLUMN teste boolean NOT NULL DEFAULT false;
ALTER TABLE link_barrado ADD COLUMN teste boolean NOT NULL DEFAULT false;

-- Atualizacao das politicas RLS para ocultar linhas de teste quando o modo homologacao da loja estiver desligado

DROP POLICY IF EXISTS agendamento_da_loja ON agendamento;
CREATE POLICY agendamento_da_loja ON agendamento
  USING (
    loja_id = nullif(current_setting('app.loja_id', true), '')::uuid
    AND (
      teste = false 
      OR EXISTS (
        SELECT 1 FROM loja_homologacao lh 
        WHERE lh.loja_id = agendamento.loja_id AND lh.ativo = true
      )
    )
  )
  WITH CHECK (
    loja_id = nullif(current_setting('app.loja_id', true), '')::uuid
  );

DROP POLICY IF EXISTS cliente_da_loja ON cliente;
CREATE POLICY cliente_da_loja ON cliente
  USING (
    loja_id = nullif(current_setting('app.loja_id', true), '')::uuid
    AND (
      teste = false 
      OR EXISTS (
        SELECT 1 FROM loja_homologacao lh 
        WHERE lh.loja_id = cliente.loja_id AND lh.ativo = true
      )
    )
  )
  WITH CHECK (
    loja_id = nullif(current_setting('app.loja_id', true), '')::uuid
  );

DROP POLICY IF EXISTS agendamento_servico_da_loja ON agendamento_servico;
CREATE POLICY agendamento_servico_da_loja ON agendamento_servico
  USING (
    loja_id = nullif(current_setting('app.loja_id', true), '')::uuid
    AND (
      teste = false 
      OR EXISTS (
        SELECT 1 FROM loja_homologacao lh 
        WHERE lh.loja_id = agendamento_servico.loja_id AND lh.ativo = true
      )
    )
  )
  WITH CHECK (
    loja_id = nullif(current_setting('app.loja_id', true), '')::uuid
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON loja_homologacao TO agendz_app;

-- Triggers para marcar automaticamente lancamentos como teste quando o modo homologacao estiver ativo
CREATE OR REPLACE FUNCTION definir_modo_homologacao() RETURNS TRIGGER AS $$
DECLARE
  v_ativo boolean;
  v_sessao integer;
BEGIN
  SELECT ativo, sessao_atual INTO v_ativo, v_sessao FROM loja_homologacao WHERE loja_id = NEW.loja_id;
  IF v_ativo = true THEN
    NEW.teste := true;
    NEW.teste_sessao := v_sessao;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_agendamento_homologacao
  BEFORE INSERT ON agendamento
  FOR EACH ROW EXECUTE FUNCTION definir_modo_homologacao();

CREATE OR REPLACE TRIGGER trg_cliente_homologacao
  BEFORE INSERT ON cliente
  FOR EACH ROW EXECUTE FUNCTION definir_modo_homologacao();

CREATE OR REPLACE TRIGGER trg_movimento_estoque_homologacao
  BEFORE INSERT ON movimento_estoque
  FOR EACH ROW EXECUTE FUNCTION definir_modo_homologacao();

