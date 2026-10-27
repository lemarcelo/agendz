-- Plataforma: tabelas que existem ANTES de saber qual é a loja (o filtro do Host as consulta). Sem RLS.
-- Spec: docs/F1-lojas-por-dns.md

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'agendz_app') THEN
    CREATE ROLE agendz_app NOLOGIN;  -- papel das consultas de negócio; não é dono nem superusuário, então o RLS vale para ele
  END IF;
END
$$;

CREATE TABLE tipo_estabelecimento (
  id text PRIMARY KEY
);
INSERT INTO tipo_estabelecimento (id) VALUES ('estetica_automotiva'), ('barbearia');

CREATE TABLE loja (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,
  nome       text NOT NULL,
  tipo       text NOT NULL REFERENCES tipo_estabelecimento (id),
  logo       text,
  tema_cor   text,
  tema_cor2  text,
  criada_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loja_slug_valido CHECK (
    slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'
    AND slug NOT IN ('www','app','api','admin','painel','static','assets','mail','agendar','login','suporte','status')
  )
);

-- O tipo é definido na criação e nunca muda.
CREATE FUNCTION loja_tipo_imutavel() RETURNS trigger AS $$
BEGIN
  IF NEW.tipo <> OLD.tipo THEN
    RAISE EXCEPTION 'O tipo da loja nao pode mudar (loja %)', OLD.slug;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER loja_tipo_imutavel BEFORE UPDATE ON loja
  FOR EACH ROW EXECUTE FUNCTION loja_tipo_imutavel();

-- Domínio próprio da loja. Só vale com verificado = true (o Caddy pergunta antes de emitir certificado).
CREATE TABLE loja_dominio (
  host       text PRIMARY KEY,
  loja_id    uuid NOT NULL REFERENCES loja (id) ON DELETE CASCADE,
  verificado boolean NOT NULL DEFAULT false,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loja_dominio_host_minusculo CHECK (host = lower(host) AND host !~ '[:/\s]')
);
CREATE INDEX loja_dominio_loja ON loja_dominio (loja_id);

GRANT SELECT ON tipo_estabelecimento, loja, loja_dominio TO agendz_app;
