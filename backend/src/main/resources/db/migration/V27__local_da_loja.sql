-- Endereço e localização da loja (configurados em Estabelecimento, depois de iniciar o uso; o assistente de início não pede).
-- 1) Endereço em campos (rua, número, complemento, bairro, cidade, UF, CEP). `endereco_no_link`: mostrar o endereço na página de agendamento do cliente.
-- 2) Localização por GPS (latitude/longitude). `localizacao_no_whatsapp`: mandar o link do mapa junto da mensagem de WhatsApp com o link de agendamento.
-- Tudo opcional; os dois interruptores nascem desligados (nada sai sem o dono ligar).
ALTER TABLE configuracao_loja
  ADD COLUMN endereco_logradouro  text CHECK (endereco_logradouro  IS NULL OR char_length(endereco_logradouro)  <= 120),
  ADD COLUMN endereco_numero      text CHECK (endereco_numero      IS NULL OR char_length(endereco_numero)      <= 20),
  ADD COLUMN endereco_complemento text CHECK (endereco_complemento IS NULL OR char_length(endereco_complemento) <= 60),
  ADD COLUMN endereco_bairro      text CHECK (endereco_bairro      IS NULL OR char_length(endereco_bairro)      <= 60),
  ADD COLUMN endereco_cidade      text CHECK (endereco_cidade      IS NULL OR char_length(endereco_cidade)      <= 60),
  ADD COLUMN endereco_uf          text CHECK (endereco_uf          IS NULL OR endereco_uf  ~ '^[A-Z]{2}$'),
  ADD COLUMN endereco_cep         text CHECK (endereco_cep         IS NULL OR endereco_cep ~ '^[0-9]{8}$'),
  ADD COLUMN endereco_no_link     boolean NOT NULL DEFAULT false,
  ADD COLUMN latitude             numeric(9,6) CHECK (latitude  IS NULL OR (latitude  BETWEEN -90  AND 90)),
  ADD COLUMN longitude            numeric(9,6) CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
  ADD COLUMN localizacao_no_whatsapp boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT local_coordenadas_juntas CHECK ((latitude IS NULL) = (longitude IS NULL));
