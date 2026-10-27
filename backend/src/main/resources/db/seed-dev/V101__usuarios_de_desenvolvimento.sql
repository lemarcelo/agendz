-- Só em dev e teste. Senha de todos: 1234 (BCrypt). Produção cria o dono pela API da plataforma.
INSERT INTO usuario (loja_id, identificador, nome, papel, senha_hash) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'davi',   'Davi',   'dono',         '$2a$10$IlQxxgVQLtNKvB/zNhvZHO7uE77gh6rnd8Up83sH3kRgXEMg9t8sm'),
  ('00000000-0000-0000-0000-0000000000a1', 'pablo',  'Pablo',  'profissional', '$2a$10$IlQxxgVQLtNKvB/zNhvZHO7uE77gh6rnd8Up83sH3kRgXEMg9t8sm'),
  ('00000000-0000-0000-0000-0000000000a1', 'marcelo','Marcelo','profissional', '$2a$10$IlQxxgVQLtNKvB/zNhvZHO7uE77gh6rnd8Up83sH3kRgXEMg9t8sm'),
  ('00000000-0000-0000-0000-0000000000b1', 'alan',   'Alan',   'dono',         '$2a$10$IlQxxgVQLtNKvB/zNhvZHO7uE77gh6rnd8Up83sH3kRgXEMg9t8sm'),
  ('00000000-0000-0000-0000-0000000000b2', 'proprietario', 'Proprietário', 'dono',         '$2a$10$IlQxxgVQLtNKvB/zNhvZHO7uE77gh6rnd8Up83sH3kRgXEMg9t8sm'),
  ('00000000-0000-0000-0000-0000000000b2', 'colaborador1', 'Colaborador 1', 'profissional', '$2a$10$IlQxxgVQLtNKvB/zNhvZHO7uE77gh6rnd8Up83sH3kRgXEMg9t8sm');
