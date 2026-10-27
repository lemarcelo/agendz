-- Quem atende aparece na agenda; dono pode não atender. Profissional desativado (ativo=false) não entra nem logado.
ALTER TABLE usuario ADD COLUMN atende boolean NOT NULL DEFAULT true;
