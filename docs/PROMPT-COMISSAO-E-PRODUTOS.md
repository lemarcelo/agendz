# Prompt: comissão em três níveis + produtos no assistente de início

**Contexto:** Agendz (`/home/claude/agendz`). Leia antes: `CLAUDE.md`, `docs/ESTADO-DO-PROJETO.md`, `docs/PROMPT-CONTINUACAO.md`, `docs/F2-front-na-api-real.md`, a seção de comissão do `prompt-agendz-regras.md` e as skills `agendz-*`. Entra na fatia **5d** (junto de produtos, pagamento e comissão no servidor).

## Pedido do Marcelo (28/10)
1. **Configurar a comissão por funcionário:** a pessoa usa a regra geral do estabelecimento ou uma própria. Isso pode ser definido no **assistente de configuração do início do uso** (e em Reconfigurar).
2. **Ordem de prioridade (o mais específico vence):** estabelecimento → funcionário → serviço. O percentual do **serviço sobrepõe** os outros; sem ele vale o do funcionário; sem esse, o geral do estabelecimento.
3. **Produtos à venda** também são configurados no assistente de início (nome, preço, comissão do produto opcional, estoque inicial opcional).

## ⚠ Regra que muda
Hoje a regra fixa é **funcionário > serviço > padrão** (`domain/comissao.js`, `CLAUDE.md`). O pedido **inverte** os dois primeiros: **serviço > funcionário > estabelecimento**. Faça assim:
- Troque a ordem no simulador (`comissao.js`) **e** no servidor, com o mesmo JSON de equivalência (`equivalencia/comissao.json`) rodando nos dois.
- Atualize `CLAUDE.md` (seção Atendimento local e comissão), o prompt vivo (seção + `### vN` no histórico) e `docs/MAPA-API-SPRING.md`.
- **Comissão já congelada em `a.comissoes` não muda.** Só vale para atendimentos novos. Registre isso na decisão.
- Percentual do serviço **vazio** = "usar o do funcionário/estabelecimento" (não zero). Zero explícito = sem comissão naquele serviço. Mesma ideia no funcionário.

## Fazer, nesta ordem
1. **Modelo e servidor** (migração nova): `estabelecimento.comissao_padrao_pct` (nulo = sem comissão); em `usuario`: `comissao_modo` (`estabelecimento` | `proprio`) e `comissao_pct` (só vale no modo `proprio`); serviço já tem `comissaoPct` (nulo = herdar). Função única `percentualDaComissao(servico, usuario, estabelecimento)` no servidor e em `domain/comissao.js`; todo cálculo passa por ela. Valores 0–100, `r2`.
2. **Tela Equipe** (`src/ui/real/Equipe.jsx` e a simulada): campo "Comissão: usar a do estabelecimento / definir para esta pessoa" + percentual. Só dono vê e altera; profissional nunca vê percentuais (regra existente).
3. **Estabelecimento:** campo da comissão geral (dono).
4. **Assistente de início** (`src/ui/leve/PrimeiroAcesso.jsx`, `OnboardingController`, catálogo por tipo): passo **comissão geral** e, na etapa da equipe, a escolha por pessoa; passo **produtos** (lista com nome, preço, comissão opcional, estoque opcional; sugestões por tipo em `src/tipos/<tipo>/`, gerar o catálogo com `node tools/gerar-catalogo.mjs`). Tudo **aditivo e reversível** como o Reconfigurar (desfazer desativa, nunca exclui). Produto sem a tabela de estoque no servidor: criar o mínimo (materiais do tipo `produto`) sem puxar o módulo de estoque inteiro.
5. **Testes:** unidade da precedência (as 3 combinações + vazio × zero + congelado não muda), equivalência simulador × servidor, `OnboardingTest`, e2e do assistente nos dois tipos (390 px, fonte larga). Atualize os testes antigos que esperavam funcionário > serviço.
6. **Segurança:** percentuais só para dono/master; esteticista/profissional continua recebendo só o DTO sem percentual; escrita confere permissão no servidor.
7. **Preparar para o backlog:** tabelas novas já com a marca `teste` prevista (`docs/BACKLOG-FUTURO.md` B1) e ações gravando no log (B2) quando existirem.

## Entrega
Siga `agendz-manutencao-e-entrega`: `npm run verificar` e depois `npm run testar:barbearia` (em sequência), Artifact, prompt vivo, zip, commit, CI e deploy verdes. Relato ao Marcelo em até 10 linhas, simples. Compare com as skills e proponha atualização.

## Dúvidas (decida com bom senso, registre e avise)
- D1: o assistente deve **sugerir** produtos por tipo ou começar vazio? (padrão: sugerir, tudo desmarcado.)
- D2: comissão do funcionário vale para **produtos** que ele vende? (padrão: não; produto tem o próprio percentual, como hoje.)
