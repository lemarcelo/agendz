-- B9b: ordem da tela Atender (etapas e campos de Veículo e de Cliente), separada para o agendamento futuro e o atendimento feito.
-- Texto JSON {"futuro":{"etapas":[..],"veiculo":[..],"cliente":[..]},"local":{..}}; nulo = ordem de fábrica. O servidor sempre sanea ao ler e ao gravar.
ALTER TABLE configuracao_loja ADD COLUMN ordem_atender text;
