# F0: tipos de estabelecimento (especificação)

Status: **aprovada pelo Marcelo, com uma correção na D4** (o tipo não pode ser trocado depois de criado). Cada decisão tem um número (D1 a D5).

## Objetivo
Um código só serve **estética automotiva** e **barbearia**. O tipo é um perfil de capacidades guardado na loja (`estabelecimento.tipo`). **Tipo novo = uma entrada nova no catálogo**, sem mexer nas telas.

## D1. Capacidades por tipo (recomendado)
| Capacidade | Estética automotiva | Barbearia |
|---|---|---|
| `usaVeiculo` (placa e veículo no cadastro e no agendamento) | sim | não |
| `precoPorPorte` (preço e duração por porte) | sim | não (preço e duração únicos) |
| `usaRecursoFisico` (box/cadeira que não pode duplicar) | sim (Box) | **não** (o barbeiro já é o recurso); opcional, desligado |
| `multiDia` (serviço de vários dias) | sim | não |
| `prontoParaRetirada` (marcadores "Em serviço" e "Pronto") | sim | não |
| combos, produtos, estoque, comissão, cupons | sim | sim |
| link público, lembretes de 24 h e 2 h, WhatsApp | sim | sim |

Regra: nenhuma tela pergunta "é estética?"; pergunta a capacidade (`cap(estab, 'usaVeiculo')`).

## D2. Rótulos por tipo (recomendado)
| Chave | Estética automotiva | Barbearia |
|---|---|---|
| `profissional` | Esteticista | Barbeiro |
| `recurso` | Box | Cadeira |
| `itemDoCliente` | Veículo | (não existe) |
| `retirada` | Pronto para retirada | (não existe) |
| `cliente` | Cliente | Cliente |

Mensagens do WhatsApp: "carro pronto" só existe na estética. Os demais modelos são comuns.

## D3. Serviços de exemplo ao criar a loja (recomendado)
- **Estética:** o catálogo atual (lavagem, polimento, vitrificação, cristalização etc., preço e duração por porte).
- **Barbearia:** Corte, Barba, Corte + barba (combo), Sobrancelha, Pezinho, Hidratação. Preços e durações de exemplo, todos editáveis.

O dono apaga ou edita tudo depois; o exemplo só evita começar do zero.

## D4. O tipo é definido na criação e **nunca muda** (decisão do Marcelo)
- O **administrador da plataforma** escolhe o tipo ao criar a loja.
- Depois de criada, **ninguém** altera o tipo: nem o dono, nem o administrador. A API recusa qualquer tentativa (`tipo` em `estabelecimento.salvar` com valor diferente devolve erro), e no banco a coluna `tipo` não é atualizável.
- A tela Estabelecimento mostra o tipo **somente leitura**. Quem precisa de outro tipo cria **outra loja**.
- Consequência boa: não existe dado oculto nem agendamento que dependa de capacidade desligada; a regra fica simples e sem migração entre tipos.

## D5. "Pronto" quando
1. `npm run verificar` passa **nos dois tipos** (matriz).
2. Nenhuma tela ou mensagem tem "Esteticista", "Box", "Veículo" ou "carro" escrito fixo fora do catálogo (teste estático com lista de exceções).
3. Cada tipo mostra os seus menus, formulários, rótulos e link do cliente; a tela Estabelecimento exibe o tipo só para leitura.
4. Teste novo `tests/tipos.test.mjs` cobre: catálogo válido, tipo inválido recusado na criação, **tentativa de mudar o tipo recusada** (dono, master e API), tipo exibido só para leitura.
5. Adicionar um tipo de teste só no catálogo funciona sem alterar nenhuma tela.

## Modelo técnico
- `src/domain/tipos.js` (registro) + `src/tipos/<tipo>/definicao.js` (id, nome, capacidades, rótulos, `vocab`, `visual`, exemplo), `cap(estab, nome)`, `rotulo(estab, chave)`.
- `estabelecimento.tipo` (padrão `estetica_automotiva`). API: o tipo entra só na criação da loja (validado contra o catálogo); `estabelecimento.salvar` **recusa** mudar o `tipo`. `publico.config` devolve capacidades e rótulos.
- UI: `useCap(nome)` e `useRotulo(chave)` nos componentes. `seedDoTipo(tipo)` monta os dados de exemplo.
- Mapa da API e Spring: `docs/MAPA-API-SPRING.md` ganha o campo `tipo` e a rota de troca. No backend o catálogo vira a tabela `tipo_estabelecimento` e a loja guarda `tipo` com atualização proibida.

## Entrega em 3 partes (cada uma testada e publicada)
- **P1:** catálogo, campo `tipo`, `cap` e `rotulo`, rótulos dinâmicos nas telas e mensagens, teste estático. **Feita (v68):** o rótulo do profissional; box/cadeira e os textos de veículo ficam para a P2.
- **P2:** barbearia como tipo (preço único, sem veículo nem box), seed por tipo e testes nos dois tipos. **Feita (v69):** a suíte da v64 (381 + 29) passa no tipo barbearia; ver `docs/EQUIVALENCIA-BARBEARIA.md`.
- **P3:** Estabelecimento mostra o tipo só para leitura; reinício da demonstração com escolha do tipo (**só no protótipo**, apaga os dados de exemplo e vira outra loja); documentos e skills. **Feita (v69):** seletor na tela de login (só demonstração) e arquivos por tipo em `src/tipos/<tipo>/`; skills `agendz-*` pendentes.

## Fora do escopo
Backend, banco e lojas de verdade (F1). Academia (adiada). Papel de administrador da plataforma na tela (F1; na F0 o tipo da loja de exemplo é fixado no seed e não muda).

## Riscos
- O código da barbearia evoluiu à parte; pode haver regras que só existem lá. A comparação da P2 decide o que trazer.
- Mensagens de WhatsApp no formato da Meta não aceitam rótulo dinâmico sem variável; os modelos ficam genéricos ("a loja", "o profissional").
