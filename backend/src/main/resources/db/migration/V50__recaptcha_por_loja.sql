-- V50: reCAPTCHA proprio por loja (delegacao de chave do site e segredo)
-- Permite que a loja configure suas proprias chaves do Google reCAPTCHA v2 (util para dominios proprios).
-- Quando nao configurado, o servidor faz fallback para as chaves globais da plataforma.

ALTER TABLE configuracao_loja
  ADD COLUMN IF NOT EXISTS recaptcha_chave_site text CHECK (recaptcha_chave_site IS NULL OR length(recaptcha_chave_site) <= 100),
  ADD COLUMN IF NOT EXISTS recaptcha_segredo text CHECK (recaptcha_segredo IS NULL OR length(recaptcha_segredo) <= 150);
