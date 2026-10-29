-- Só em dev e teste: a Apex (estética) precisa de boxes para aceitar carro. Em produção os boxes nascem ao concluir o assistente de início (ou o dono cadastra).
INSERT INTO box (loja_id, nome, ordem) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Box 1', 0),
  ('00000000-0000-0000-0000-0000000000a1', 'Box 2', 1),
  ('00000000-0000-0000-0000-0000000000a1', 'Box 3', 2);
