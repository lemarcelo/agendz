-- V62 (G2): modos da escolha automática do BOX na estética, os mesmos do profissional (V57): livre (o box mais livre), aleatorio, menos (atendeu menos no mês) e fila (circular).
-- Só vale quando ninguém pediu um box: o box pedido ou o que o carro já tinha continuam mandando. Quem muda é só o proprietário (Estabelecimento > Boxes).
-- A fila circular de boxes guarda só o ÚLTIMO box escolhido (o ponteiro), uma linha por loja; avança apenas na criação do agendamento, na mesma transação.
ALTER TABLE configuracao_loja
  ADD COLUMN modo_escolha_box text NOT NULL DEFAULT 'livre' CHECK (modo_escolha_box IN ('livre', 'aleatorio', 'menos', 'fila'));

CREATE TABLE fila_box (
  loja_id       uuid PRIMARY KEY REFERENCES loja (id),
  box_id        uuid NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (loja_id, box_id) REFERENCES box (loja_id, id) ON DELETE CASCADE
);

ALTER TABLE fila_box ENABLE ROW LEVEL SECURITY;
ALTER TABLE fila_box FORCE ROW LEVEL SECURITY;
CREATE POLICY fila_box_da_loja ON fila_box
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON fila_box TO agendz_app;
