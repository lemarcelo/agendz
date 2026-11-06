-- V57 (B2): modos da escolha automática do profissional (livre = "mais livre" do B9c, aleatorio, menos, fila).
-- O modo só vale quando a escolha automática está ligada (configuracao_loja.profissional_automatico). Quem muda é só o proprietário (Estabelecimento > Regras).
-- A fila é circular por serviço: guarda só o ÚLTIMO profissional escolhido (o ponteiro). O ponteiro avança apenas na criação do agendamento, na mesma transação
-- que o grava (rollback desfaz). Sem linha = a fila começa pelo primeiro da equipe.
ALTER TABLE configuracao_loja
  ADD COLUMN modo_escolha text NOT NULL DEFAULT 'livre' CHECK (modo_escolha IN ('livre', 'aleatorio', 'menos', 'fila'));

CREATE TABLE fila_profissional (
  loja_id       uuid NOT NULL REFERENCES loja (id),
  servico_id    uuid NOT NULL,
  usuario_id    uuid NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, servico_id),
  FOREIGN KEY (loja_id, servico_id) REFERENCES servico (loja_id, id) ON DELETE CASCADE,
  FOREIGN KEY (loja_id, usuario_id) REFERENCES usuario (loja_id, id) ON DELETE CASCADE
);

ALTER TABLE fila_profissional ENABLE ROW LEVEL SECURITY;
ALTER TABLE fila_profissional FORCE ROW LEVEL SECURITY;
CREATE POLICY fila_profissional_da_loja ON fila_profissional
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON fila_profissional TO agendz_app;
