-- v121: o dono decide o que é obrigatório no link do cliente: o nome e, na estética, placa, modelo e porte (de fábrica tudo obrigatório, como era).
ALTER TABLE configuracao_loja
  ADD COLUMN link_nome_obrigatorio boolean NOT NULL DEFAULT true,
  ADD COLUMN link_veiculo_obrigatorio text NOT NULL DEFAULT 'placa,modelo,porte' CHECK (char_length(link_veiculo_obrigatorio) <= 40);
