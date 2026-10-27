# Sugestões de engenharia (não implementadas)

Foco: **menos tokens por tarefa, mais desempenho, mais acerto e manutenção fácil**, sem engessar o julgamento do Claude (decidir com bom senso e registrar continua valendo). A regra é: **rigidez só onde o erro custa caro** (dinheiro, segurança, horário, permissão), via teste e checklist; **liberdade** em interface, texto e organização.

Medidas de 2026-10-16 (v60): prompt vivo 156 KB (~40 mil tokens); `api.js` 1.076 linhas e `financeiro.js` 990 (linhas longas); pacote 674 KB; testes de unidade 8 s; **e2e 3 min (27 arquivos em fila)**; projeto **sem controle de versão** (só zips).

Legenda: **Ganho** = o que melhora · **Esforço** P/M/G.

## A. Menos tokens por tarefa (maior retorno)
| # | Sugestão | Ganho | Esforço |
|---|---|---|---|
| A1 | **Quebrar o prompt vivo** em um índice curto (≤ 5 KB, com a lista de seções e quando ler cada uma) + `docs/regras/<tema>.md` (agenda, financeiro, comissão, clientes, estoque, tema…). O Claude lê só o tema da tarefa, não 40 mil tokens. | Maior economia por tarefa | M |
| A2 | **Histórico fora do prompt:** mover "Histórico de implementação" para `docs/HISTORICO.md` (só acrescenta); ler só as 3 últimas entradas. | Metade do prompt sai do caminho | P |
| A3 | **Índice de código gerado** (`docs/INDICE.md`: arquivo → exports → 1 linha; script + teste que falha se estiver velho, como o do mapa). Evita abrir arquivo grande para achar uma função. | Menos leituras | P |
| A4 | **Dividir `api.js` e `financeiro.js` por assunto** (`api/agenda.js`, `api/clientes.js`…, `financeiro/cobranca.js`, `conciliacao.js`…) mantendo o mesmo `import` público. O mapa de API passa a dizer o arquivo de cada método. | Leitura e edição de trechos pequenos | M |
| A5 | **Saída enxuta dos testes:** `verificar` imprime só falhas e uma linha de resumo por bloco (hoje lista cada "ok"). Capturas de tela só sob pedido ou em falha. | Menos texto lido a cada rodada | P |
| A6 | **`CLAUDE.md` só com invariantes** (≤ 120 linhas) e links para os temas; notas de versão (v54…v60) saem dele e vão para o histórico. | Contexto fixo menor | P |
| A7 | **Formatar com Prettier/ESLint** (linhas de até 120 colunas). Linhas de 300 caracteres tornam edições por trecho frágeis e diffs ruins. | Menos erro de edição | M |

## B. Desempenho
| # | Sugestão | Ganho | Esforço |
|---|---|---|---|
| B1 | **Rodar os e2e em paralelo** (workers, um navegador compartilhado). De ~3 min para ~1 min por rodada. | Tempo e custo de cada verificação | M |
| B2 | **Teste de carga primeiro, otimização depois:** semear 5 mil clientes e 20 mil agendamentos e medir abertura, busca, `tick` e `mutate`. Só otimizar o que passar do limite combinado. | Evita otimizar às cegas | M |
| B3 | **`mutate` clona o estado inteiro** (`structuredClone`) a cada operação e o `tick` percorre tudo. Se o B2 mostrar lentidão: patches (Immer) ou cópia só da fatia mexida; `tick` por índice (status/data). No backend real isso some (transação). | Escala | G |
| B4 | **Índices em memória** (`Map` por id de cliente, serviço e agendamento) no lugar de `find` dentro de laços e de renderização de linhas. | Listas grandes | P |
| B5 | **Memoizar cálculos de relatório** e **virtualizar** tabelas com mais de ~200 linhas. | Telas pesadas | M |
| B6 | **Orçamento de tamanho do pacote como teste** (falha se passar de, por exemplo, 800 KB). No deploy real: carregar Relatórios/Financeiro sob demanda. | Evita crescimento silencioso | P |

## C. Acerto (menos bug, menos incoerência)
| # | Sugestão | Ganho | Esforço |
|---|---|---|---|
| C1 | **Código estável por erro** (`ERR_COMISSAO_PAGA`) além da mensagem. Testes e telas conferem o código, não o texto, e a tradução/ajuste de mensagem não quebra nada. | Testes menos frágeis | M |
| C2 | **Regras em tabelas de dados** (permissões, campos obrigatórios, transições de status) com teste gerado da própria tabela, em vez de `if` espalhado. | Menos esquecimento | M |
| C3 | **Tipos sem migrar:** JSDoc + `tsc --checkJs`. Pega campo trocado e `undefined` sem reescrever em TypeScript. | Erros de forma de dado | M |
| C4 | **Testes por propriedade** (fast-check) para dinheiro, horários e comissão, e **teste de mutação** (Stryker) no domínio para provar que os testes pegam bug de verdade. | Confiança real | M |
| C5 | **Mais teste de unidade, menos e2e:** mover lógica de tela para funções puras (como `filtrarClientes`) e deixar o e2e só nos fluxos críticos. | Rápido e estável | M |
| C6 | **Construtores de dados de teste** (`tests/helpers.mjs`: `como()`, `dia()`, `clienteCom()`), hoje repetidos em cada arquivo. | Menos duplicação | P |
| C7 | **Teste de "documento x código":** o que o prompt cita (testids, funções, campos) existe no código, e o contrário para métodos da API (já existe para o mapa). | Doc nunca desatualiza | M |
| C8 | **Snapshot dos modelos de mensagem do WhatsApp** (texto final por modelo e variável). | Mensagem não muda sem querer | P |

## D. Manutenção fácil
| # | Sugestão | Ganho | Esforço |
|---|---|---|---|
| D1 | **Controle de versão (git):** inicializar, uma tag por `vNN`, hook de pré-commit (autoria, mapa, testes rápidos). Hoje só há zips, sem diff nem volta fácil. | Segurança e histórico | P |
| D2 | **CI** (GitHub Actions) rodando `verificar` a cada alteração. | Nada quebrado entra | P |
| D3 | **Receitas de mudança** (`docs/RECEITAS.md`): "adicionar um campo" = seed + validação na API + mapa + tela + teste + prompt; "adicionar tela" = ordem personalizável + e2e + autoria. Evita esquecer etapa (já tropeçamos no mapa e na autoria). | Menos retrabalho | P |
| D4 | **Decisões sem confirmação em `docs/DECISOES.md`** (data, o quê, por quê, como reverter), pesquisável, em vez de só dentro do histórico. | Revisão rápida | P |
| D5 | **Remover código morto:** a parte de criação do `FormAgendamento` (hoje só remarca) e `dbg.mjs`; usar `knip` para achar o resto. | Menos para ler | P |
| D6 | **Dividir telas grandes** (`Financeiro.jsx` 609, `Agendamento.jsx` 479) em componentes por aba/bloco. | Edição segura | M |
| D7 | **Dependências:** fixar versões, `npm audit` na verificação, atualização automática com teste (Renovate/Dependabot). | Segurança contínua | P |

## Ordem sugerida
1. **A2 + A6 + A5 + D1** (horas, barato, ganho imediato em tokens e segurança).
2. **A1 + A3 + B1** (maior economia por tarefa e verificação mais rápida).
3. **B2** (medir antes de otimizar), depois B3–B5 só se necessário.
4. **C1 + C6**, depois C3 e C4.
5. **A4 + D5 + D6** quando for mexer nessas áreas de qualquer forma.

## Como manter a flexibilidade do Claude
- Teste, tabela e checklist guardam o que não pode errar; o texto das instruções continua dizendo "decida com bom senso e registre".
- Índice e divisão por tema reduzem o que ele precisa ler, não o que ele pode propor: melhorias de interface, texto e organização seguem livres.
- Mudança que afeta dinheiro, permissão ou horário sempre exige teste novo; o resto pode ser decidido sem perguntar.
