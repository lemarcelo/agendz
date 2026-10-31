-- v122: o dono cadastra os portes (tamanhos de veículo) da loja. A lista fica em `configuracao_loja.portes` (JSON; sem linha ou vazia = os cinco de fábrica).
-- Os portes novos têm id gerado pelo servidor, então a trava dos cinco ids fixos sai e entra uma trava de formato.
ALTER TABLE configuracao_loja ADD COLUMN portes text CHECK (portes IS NULL OR char_length(portes) <= 4000);
ALTER TABLE agendamento DROP CONSTRAINT IF EXISTS agendamento_porte_check;
ALTER TABLE agendamento ADD CONSTRAINT agendamento_porte_check CHECK (porte IS NULL OR porte ~ '^[a-z0-9-]{2,24}$');
ALTER TABLE cliente_veiculo DROP CONSTRAINT IF EXISTS cliente_veiculo_porte_check;
ALTER TABLE cliente_veiculo ADD CONSTRAINT cliente_veiculo_porte_check CHECK (porte ~ '^[a-z0-9-]{2,24}$');
