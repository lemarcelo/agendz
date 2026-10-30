-- Link de agendamento do cliente: telefone obrigatório por padrão; o proprietário pode tirar a obrigatoriedade (o pedido fica sem cadastro, só com o nome).
ALTER TABLE configuracao_loja
  ADD COLUMN link_telefone_obrigatorio boolean NOT NULL DEFAULT true;
