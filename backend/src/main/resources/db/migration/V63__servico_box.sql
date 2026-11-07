-- V63 (G3): boxes permitidos por serviço (estética). Serviço SEM linhas aqui = qualquer box; com linhas, só esses. O servidor decide (escolha automática, pedido, link do cliente);
-- o cliente nunca escolhe box. Carro com vários serviços usa a interseção: o box precisa ser permitido a TODOS os serviços restritos.
CREATE TABLE servico_box (
  loja_id    uuid NOT NULL REFERENCES loja (id),
  servico_id uuid NOT NULL,
  box_id     uuid NOT NULL,
  PRIMARY KEY (servico_id, box_id),
  FOREIGN KEY (loja_id, servico_id) REFERENCES servico (loja_id, id) ON DELETE CASCADE,
  FOREIGN KEY (loja_id, box_id) REFERENCES box (loja_id, id) ON DELETE CASCADE
);

ALTER TABLE servico_box ENABLE ROW LEVEL SECURITY;
ALTER TABLE servico_box FORCE ROW LEVEL SECURITY;
CREATE POLICY servico_box_da_loja ON servico_box
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON servico_box TO agendz_app;
