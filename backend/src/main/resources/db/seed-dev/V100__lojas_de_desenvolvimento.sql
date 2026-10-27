-- Só em dev e teste (perfis dev/test). Produção cria lojas pela API da plataforma.
INSERT INTO loja (id, slug, nome, tipo) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'apex',     'Apex Estética Automotiva', 'estetica_automotiva'),
  ('00000000-0000-0000-0000-0000000000b1', 'dalforno', 'Barbearia Dalforno',       'barbearia'),
  ('00000000-0000-0000-0000-0000000000b2', 'offbox',   'Offbox Barbearia',         'barbearia');

INSERT INTO loja_dominio (host, loja_id, verificado) VALUES
  ('agenda.apexestetica.com.br',      '00000000-0000-0000-0000-0000000000a1', true),
  ('agenda.barbeariadalforno.com.br', '00000000-0000-0000-0000-0000000000b1', false);  -- ainda não verificado: não pode valer
