# Equivalência: Agendz (tipo barbearia) × Agenda Barbearia v64

Critério: o Agendz com `tipo = barbearia` faz tudo o que a Agenda Barbearia v64 faz. Base: 381 testes de unidade e 29 de navegador da v64.

## Como se prova
- `npm run importar:barbearia -- <pasta-da-v64>` copia os testes da v64 para `tests-barbearia/`. A **única** transformação é o mapa de ids internos (abaixo). Regras e textos que o usuário vê não são tocados.
- `npm run testar:barbearia` (= `node tools/rodar-testes-tipo.mjs barbearia`) gera `dist/*-barbearia.html` (tipo fixado no build) e roda os 381 + 29.
- `npm run verificar-tudo` roda a estética e a barbearia em seguida.

## Portões
| Portão | Situação |
|---|---|
| 1. Suíte da barbearia sem mudar regra | **Verde: 381/381 unidade, 29/29 navegador** |
| 2. Suíte da estética | **Verde: 444/444 unidade, 33/33 navegador** |
| 3. Isolamento entre clientes | **Bloqueado.** Hoje há uma loja por navegador (estado em memória); isolamento por rota só existe com o backend multi-tenant (F1). Entra como teste de aceite da F1, por rota: usuário da loja A pede id da loja B e recebe erro. |

## O que muda por tipo (tabela de exceções; nada fora dela)
| Item | Barbearia | Estética |
|---|---|---|
| Vocabulário | barbeiro, corte, barbearia, cadeira; "confirmação de corte"; saudação "Bem-vindo à {loja} 💈" | esteticista, serviço, loja, box; "confirmação do serviço"; "Aqui é {loja} 🚗" |
| Veículo, porte, box, "carro pronto", vários dias | desligados (nem aparecem; a API descarta os campos) | ligados |
| Preço e duração | do serviço (`preco`, `duracao`); duração exibida como "N min" | por porte |
| Dados de exemplo | Alan, Kiko, Tailuan e 5 serviços; "Folga do Kiko" | Apex (Davi, Pablo, Marcelo) |
| **Tema padrão e identidade visual** | segue o sistema (claro creme `#f4f1ea` / escuro `#141517`, latão); botão alterna automático → escuro → claro | escuro por padrão (`#0d0f12`), claro por escolha; preto + verde→lima |
| Logo da loja | Dalforno e Offbox têm logo própria (`src/tipos/barbearia/logo-*.js`); no build de equivalência (`AGENDZ_TIPO` fixo) a seed sai sem logo, como na v64 | Apex: logo da Apex |
| Modelos de WhatsApp | textos da v64 (`src/tipos/barbearia/templates.js`) | textos da estética |

Regra: exceção nova = linha nesta tabela (decisão registrada), nunca código escondido.

## Mapa de ids internos (a única transformação nos testes)
`barbeiro(s)` → `profissional/profissionais` (o id neutro da F1: `profissionalId`, `papel: 'profissional'`; era `esteticistaId` até a v71), `confirmacaoCorte` → `confirmacaoServico`, `confirmarCorte` → `confirmarServico`, `--brass` → `--acento`. Os rótulos que o usuário vê (ex.: "Barbeiro") continuam vindo do tipo. Uma consequência mecânica: listas de chaves comparadas depois de `.sort()` mudam de ordem (`['barbeiroId','inicio']` vira `['inicio','profissionalId']`); a regra testada é a mesma e o importador faz esse ajuste.
Origem dos testes: `977aa2dd-agenda-barbearia.zip` (a v64 com `src/services/api.js` único). O arquivo morto `agenda-barbearia-v64.zip` guarda o zip `244c490a` (mesma v64 com o código dividido por assunto); as regras são as mesmas e os dois foram mantidos.

## Decisões tomadas sem confirmação
1. Mensagens da página do cliente usam o nome da loja do tenant, não "Agenda Barbearia".
2. O rótulo do passo é "Dia e horário"; sem veículo, o fluxo do link começa em "Serviço" (3 passos).
3. Recursos da Apex (combo, categoria, vários dias) existem no código comum como **superconjunto**; no tipo barbearia o vários dias fica desligado e combo/categoria só aparecem se cadastrados.
4. Código em pastas por tipo (`src/tipos/<tipo>/`: definição, seed, modelos, tema), diferente da v64, que era um projeto só com tudo junto.
5. Seletor de tipo na tela de login existe **só na demonstração** (cria uma loja de exemplo nova do tipo escolhido; lembra a escolha no navegador). Fica oculto quando o build fixa o tipo. Não existe em produção: lá o tipo é escolhido na criação da loja e nunca muda.

## Fora do código
- Rotas públicas: `#agendar` vira `/agendar/{slug}` na F1; o link por profissional `#agendar-<id>` continua existindo.
- Itens em aberto herdados da v64: push real do navegador; WhatsApp real (Meta); concorrência no banco (índice/exclusão por horário); mensagem ao cliente quando o dono confirma; estado em memória (no real, PostgreSQL).
- Dados: a v64 só tem dados de exemplo; sem migração necessária hoje. Se houver cliente real antes da F1, definir migração antes de congelar.
- Skills: consolidar em um conjunto `agendz-*` (pendente; os antigos `apex-*`, `estetica-automotiva-*` e `barbearia-*` ficam para você apagar).
- Arquivo morto: `agenda-barbearia-v64.zip`; histórico e notas em `docs/barbearia-v64/`. O Artifact antigo da barbearia só é apagado se você pedir.
