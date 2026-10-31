-- B9a: o assistente de início e o Reconfigurar passam a cuidar também dos campos obrigatórios do link do cliente (nome, telefone, veículo).
-- A reconfiguração guarda a configuração do link de antes (só na primeira troca da sessão) e a nova, para o "Desfazer"/"Refazer".
-- Os valores são só marcações (sim/não e quais campos do veículo); nunca dado de cliente.
ALTER TABLE reconfiguracao
  ADD COLUMN link_trocado boolean NOT NULL DEFAULT false,
  ADD COLUMN link_antes   jsonb,
  ADD COLUMN link_depois  jsonb;
