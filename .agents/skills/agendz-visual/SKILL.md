---
name: agendz-visual
description: Padroniza implementação e revisão visual do Agendz em computador e celular, preservando temas, cores por loja e comportamento existente.
---

# Visual do Agendz

Use ao criar ou alterar telas do Agendz. Antes de editar, identifique comportamento existente, componentes e estilos compartilhados que possam afetar outras telas. Preserve permissões, dados, regras de negócio e funcionalidades; não fixe o nome, logo ou cor de uma loja.

1. Use os tokens e cores gerados a partir da marca da loja e os temas claro e escuro existentes. Preserve vocabulário e capacidades de cada tipo. Quando pedida cor semântica em botões secundários/ações (ex.: Concluir verde, Remarcar amarelo, Cancelar vermelho), siga o padrão outline de `.btn-perigo` (`background: transparent; color: var(--cor); border-color: var(--cor)`), sem chapar o fundo. Em barras de ação com Cancelar e Concluir, mantenha sempre **Cancelar à esquerda** e **Concluir à direita**.
2. Faça o menor ajuste coerente. Priorize hierarquia, alinhamento, legibilidade, consistência entre componentes, navegação identificável, foco e alvos de toque; preserve uso com teclado e textos longos.
3. Confira computador e celular, inclusive largura intermediária, sem cortes, sobreposição ou rolagem lateral indesejada. Itens novos, quantidade variável, estados vazios e erros não podem quebrar a disposição. Reutilize os componentes do projeto.
   Em listas reordenáveis aprovadas, use alça à esquerda, movimento perceptível durante o arraste e alternativa por teclado; não exiba setas redundantes. Preserve rolagem e persistência existentes.
4. Após implementar qualquer alteração visual ou mudança com reflexo visual na aplicação, faça apenas o necessário para abrir a tela local e verifique as áreas afetadas e vizinhas. **SEMPRE mostre no chat as telas reais de como ficaram** em computador (`1366px`) e celular (`390px`), identificando dados fictícios, **e explique em texto, de forma resumida, o que foi alterado**, aguardando a avaliação visual de Marcelo **antes** da suíte completa, commit, CI ou deploy. Se houver qualquer ajuste posterior durante os testes, mostre novas capturas atualizadas e o resumo da mudança antes de pedir autorização de entrega.
5. Após a avaliação, rode testes relevantes de comportamento e responsividade, incluindo regressões para defeitos encontrados. Quando estiver rodando em modelos mais leves (ex.: Flash), **compense com testes extras de regressão** em `tests/estatico.test.mjs` e nos `tests/e2e*.mjs` afetados: meça `scrollWidth <= innerWidth` em `390px` (com `DejaVu Sans`), meça ausência de sobreposição por `boundingBox()`, verifique fechamento de modais (`Escape` e botão fechar) para não bloquear cliques seguintes, e valide `data-testid` obrigatórios. Não repita verificações ainda válidas sem motivo; registre o que foi visto e testado, e declare limitações.

O desktop pode usar navegação lateral e o celular menu recolhível quando aprovados para a tela; mantenha todas as opções acessíveis, sem alterar regras ou permissões. Padrões visuais aprovados não substituem testes de funcionalidade.
