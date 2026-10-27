-- A logo da loja é uma imagem pequena em data URL (PNG, JPEG ou WebP; SVG fica de fora de propósito, como no front: src/domain/tema.js).
ALTER TABLE loja ADD CONSTRAINT loja_logo_valida CHECK (
  logo IS NULL OR (logo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$' AND length(logo) <= 140000)
);
