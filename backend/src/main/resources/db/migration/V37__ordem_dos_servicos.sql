-- v123: ordem dos serviços no Atender e no link do cliente.
--  servico.ordem = ordem manual do dono (setas subir/descer); vazio = cadastro antigo, vai depois pela ordem de nome.
--  configuracao_loja.ordem_servicos = 'uso' (mais usados primeiro, contagem derivada dos agendamentos) ou 'manual'.
ALTER TABLE servico ADD COLUMN ordem integer;
ALTER TABLE configuracao_loja ADD COLUMN ordem_servicos text NOT NULL DEFAULT 'uso' CHECK (ordem_servicos IN ('uso', 'manual'));
