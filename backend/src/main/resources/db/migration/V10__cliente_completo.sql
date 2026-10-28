-- Clientes de verdade (F2 parte 2): apelido, CPF, nascimento e telefone CIFRADOS (AES-256-GCM no aplicativo) + hash para achar e impedir duplicidade
-- (HMAC com pepper; docs/MAPA-DADOS-PESSOAIS.md). Nome e apelido ficam em texto puro (decisão do proprietário). Veículos em tabela própria.
-- Esta migração só roda sem clientes cadastrados: telefone em texto puro não tem como ser cifrado em SQL (a chave fica fora do banco).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cliente) THEN
    RAISE EXCEPTION 'Há clientes com telefone em texto puro; cifre-os pela aplicação antes de aplicar a V10.';
  END IF;
END $$;

ALTER TABLE cliente DROP COLUMN telefone;   -- leva junto a UNIQUE (loja_id, telefone)

ALTER TABLE cliente
  ADD COLUMN apelido        text NOT NULL DEFAULT '' CHECK (char_length(apelido) <= 100),
  ADD COLUMN telefone_cif   text NOT NULL,
  ADD COLUMN telefone_hash  text NOT NULL,
  ADD COLUMN cpf_cif        text,
  ADD COLUMN cpf_hash       text,
  ADD COLUMN nascimento_cif text,
  ADD COLUMN nome_chave     text GENERATED ALWAYS AS (lower(nome)) STORED,
  ADD COLUMN atualizado_em  timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT cliente_nome_ck CHECK (char_length(nome) BETWEEN 1 AND 100);

-- Mesmo telefone com nomes diferentes é permitido (família no mesmo número); telefone + nome iguais, não.
ALTER TABLE cliente ADD CONSTRAINT cliente_telefone_nome_uq UNIQUE (loja_id, telefone_hash, nome_chave);
CREATE UNIQUE INDEX cliente_cpf_uq ON cliente (loja_id, cpf_hash) WHERE cpf_hash IS NOT NULL;
CREATE INDEX cliente_telefone_idx ON cliente (loja_id, telefone_hash);

-- Veículos do cliente (só os tipos com a capacidade usaVeiculo gravam aqui).
CREATE TABLE cliente_veiculo (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id     uuid NOT NULL REFERENCES loja (id),
  cliente_id  uuid NOT NULL,
  placa       text NOT NULL CHECK (char_length(placa) BETWEEN 7 AND 8),
  placa_chave text NOT NULL CHECK (placa_chave ~ '^[A-Z0-9]{7}$'),
  marca       text NOT NULL DEFAULT '' CHECK (char_length(marca) <= 30),
  modelo      text NOT NULL CHECK (char_length(modelo) BETWEEN 2 AND 40),
  cor         text NOT NULL DEFAULT '' CHECK (char_length(cor) <= 20),
  porte       text NOT NULL CHECK (porte IN ('pequeno', 'medio', 'grande', 'suv', 'pickup')),
  ordem       integer NOT NULL DEFAULT 0,   -- posição na lista que a pessoa montou
  criado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loja_id, id),
  UNIQUE (cliente_id, placa_chave),
  FOREIGN KEY (loja_id, cliente_id) REFERENCES cliente (loja_id, id) ON DELETE CASCADE
);
ALTER TABLE cliente_veiculo ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente_veiculo FORCE ROW LEVEL SECURITY;
CREATE POLICY cliente_veiculo_da_loja ON cliente_veiculo
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON cliente_veiculo TO agendz_app;

-- Telefones anteriores (quem trocou e quando). O número antigo fica cifrado como o atual.
CREATE TABLE cliente_telefone_anterior (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id       uuid NOT NULL REFERENCES loja (id),
  cliente_id    uuid NOT NULL,
  telefone_cif  text NOT NULL,
  trocado_por   uuid,
  trocado_em    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (loja_id, cliente_id) REFERENCES cliente (loja_id, id) ON DELETE CASCADE
);
ALTER TABLE cliente_telefone_anterior ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente_telefone_anterior FORCE ROW LEVEL SECURITY;
CREATE POLICY cliente_telefone_anterior_da_loja ON cliente_telefone_anterior
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON cliente_telefone_anterior TO agendz_app;
