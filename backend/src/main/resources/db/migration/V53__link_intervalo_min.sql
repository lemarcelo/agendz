-- V53: Intervalo minimo configuravel do link de agendamento (anti-buraco)
-- Evita buracos na agenda permitindo que o cliente marque ou colado a outro horario ou com folga minima.
ALTER TABLE configuracao_loja
  ADD COLUMN IF NOT EXISTS link_intervalo_min integer NOT NULL DEFAULT 20
  CHECK (link_intervalo_min >= 0 AND link_intervalo_min <= 60);
