# Agendz: regras fixas do projeto

> **Retomando o trabalho? Leia primeiro `docs/ESTADO-DO-PROJETO.md`** (estado, VPS no ar, decisões, em aberto e próximos passos).

Protótipo React 19 + esbuild com API simulada (`src/services/api.js`), que depois vira React + Spring Boot. Fluxo de trabalho em lotes, autorização e Git: `CLAUDE.md` da raiz do workspace. O antigo `prompt-agendz-regras.md` (e o `prompt-agendz.md`) não existe neste ambiente: as regras de negócio estão aqui, em `docs/MAPA-API-SPRING.md`, `docs/MAPA-FUNCIONAMENTO.md` e nas skills; não recriar.

## Documentos de migração
- `docs/MAPA-API-SPRING.md`: cada método de `api.js` → endpoint Spring Boot, permissão, validação, regra e teste. Se `api.js` ganhar ou perder método, atualize o mapa.
- `docs/MAPA-DADOS-PESSOAIS.md`: inventário de dados pessoais, como cada um é protegido (nome e apelido ficam em texto puro e podem ir ao log; CPF, telefone, nascimento cifrados).
- `backend/`: API Spring Boot real (loja pelo Host, JWT, RLS, login, clientes); o CI roda `mvn verify` com PostgreSQL (Testcontainers). Leia `backend/README.md` e `docs/F1-lojas-por-dns.md` antes de mexer. Falha do CI: a API do GitHub mostra só anotações (o texto vem de `tools/anotar-falha-maven.sh`).
- `backend-esqueleto/`: esqueleto dos testes de integração (JUnit) do back-end; não compilado neste ambiente.

## Ordem personalizada
- Lista que o usuário vê (menu, abas, colunas, marcadores) **reordena**: abas com `<Abas ordem="nome">`, tabelas com `<Tabela id=…>` (não escreva `<table>` com `<thead>` direto), outras listas com `useOrdem`. O teste `tests/ordem.test.mjs` falha se faltar.
- A ordem salva é sempre saneada (`sanearOrdem`/`aplicarOrdem`); nunca use o valor lido do navegador direto.
- Testes de arrasto: segurar ~0,5 s com o mouse ou toque por CDP (veja `tests/e2e16.mjs`). E2E com data fixa devem fixar o relógio (`ctx.clock.setFixedTime`).

## Cupons, cores e permissões
- Cupom: a chave é gerada **só no servidor** (`gerarChave`), nunca vem do cliente; resposta ao cliente é sempre a genérica `GENERICO`; o uso é derivado dos agendamentos (não há contador); desconto entra por `itensDoAgendamento` (campo `desconto`), nunca somando valor à mão. Cupom vencido/encerrado é histórico e não se altera.
- Cor de quem não tem foto vem de `coresDaEquipe` (nunca repete); não use `corDaPessoa` para a equipe.
- Permissões: `pode()` lê `permissoes` (true/false) por cima do padrão do perfil (`PERMISSOES_PADRAO`); Relatórios não é liberável (só dono e master; esteticista vê os próprios).

## Atendimento local e comissão
- Atendimento local (`a.local`, criado por `agenda.atender` quando a data é agora ou passada) nunca cria mensagem, Pix, cupom nem remarcação; cria cadastro de cliente por nome+telefone ou só telefone (nunca só nome; `resolverClienteDoAtendimento`); sem telefone fica `nomeAvulso`. Todo código que lê `clienteId` ainda precisa de guarda.
- Comissão (`domain/comissao.js`): percentual **serviço > profissional > geral da loja** (o mais específico vence; vazio = herdar, 0 = sem comissão; dono/master sem percentual próprio = 100; v91), congelado em `a.comissoes` (atendimento já feito não muda); base = valor − cupom (acréscimo foi removido na v55; valores antigos ainda somam). O esteticista só recebe DTO de `relatorioDoProfissional` (nunca valor cheio, parte da casa, percentual ou custo de material); percentuais e pagamento são só do dono/master.
- Material tem `tipo`: `material` (consumo nos serviços) ou `produto` (vendido, com `preco`). Produtos vão em `a.produtos` (`materialId`, `qtd`, `preco` congelado), ficam fora de cupom, mas entram na cobrança Pix (`partesCobranca`, conta do grupo do produto) e somam no "total com produtos" e nos relatórios e comissionam o **vendedor da linha** (`vendedorId`, padrão o esteticista do atendimento) só se o produto tem `comissaoPct` (congelado em `pct`) e baixam estoque pela diferença (`sincronizarEstoque`). Adicionar serviço/produto nunca muda o status.
- Atendimento local pode ser **só produto** (`servicoIds` vazio, ≥1 produto). Comissão é por beneficiário (`partesDoAgendamento`): serviços e produtos do próprio esteticista vão para o esteticista; produto de outro vendedor, para o vendedor, cada parte com o seu "pago" (`a.comissaoPaga` / `comissaoPaga` na linha). Todo código que lê `a.servicoIds` precisa aceitar lista vazia; esteticista sempre vende como ele mesmo.
- Listas de serviços e produtos (Atender, ficha) usam `ListaItens` (lupa por nome/código); produtos seguem `porUltimoUso` (últimos usados primeiro, `domain/codigo.js`) e **serviços** seguem a ordem da loja (v123: `servicosNaOrdemDaLoja`, mais usados ou ordem do dono); serviço e produto têm `codigo` (próximo número, editável, único por tipo).
- Status escolhido à mão com o horário já iniciado grava `a.statusManual` (com o `inicio`); o `tick` então não conclui, não cancela por falta de confirmação nem avisa o cliente. Remarcar (novo `inicio`) libera o fluxo automático.

## Antes de qualquer alteração
- Leia o trecho do assunto neste arquivo, em `docs/MAPA-FUNCIONAMENTO.md` (o que cada perfil vê e faz) e em `docs/MAPA-API-SPRING.md` (rotas, permissão, validação). Use `grep` em `docs/HISTORICO-VERSOES.md` para o porquê de uma regra.
- Regra nova ou mudada: atualize o prompt (seção + entrada no **Histórico de implementação**, com as decisões tomadas sem confirmação) no mesmo trabalho.

## Regras que nunca se quebram
1. **Toda função de escrita do painel confere permissão** (`exigir`, `R.pode`, `podeAutorizarVinculo`, sessão). Quem não tem permissão recebe erro, nunca dado. A porta do WhatsApp não tem usuário: confere que o agendamento ou cadastro pertence ao número do remetente (`telefone`), nunca o id ou o CPF enviados. Cancelar pelo cliente só com 24 h ou mais, conferido na API (não só no botão). O número do canal só vale em `55`+DDD+número (`telefoneDoCanal`); 10/11 dígitos sem o 55 é de outro país.
2. **Entrada nunca é confiável.** Campos passam por `pegar` (lista de campos aceitos + `limparTexto`), números por `finito` com teto, listas com limite, ids por tipo e tamanho. Nada de `Object.assign` com o corpo inteiro.
3. **Texto de pessoa só entra na tela como texto** (React escapa). Proibido `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `alert/confirm/prompt` (o Artifact bloqueia; confirme na própria tela).
4. **Segredos e dados pessoais:** CPF completo não sai em listas de aviso ou pedido (use `cpfMascarado`); respostas ao cliente não dizem de quem é um cadastro; código de recuperação só pelo canal (no protótipo, só com `MODO_DEMO`); senha nunca vai em DTO (`semUsuarioSenha`).
5. **Horário nunca duplica:** toda criação, remarcação, reativação e edição de serviço passa por `validarHorario`/`acharConflitos`. Mudança que afeta horários precisa de teste em `tests/conflitos.test.mjs`.
6. **Dinheiro:** valores finitos, com teto, em `r2`; o acerto do valor pago (crédito, despesa ou devolvido por fora) nunca passa do valor pago e não se repete; a saída do banco de uma devolução concilia com a despesa e não vira pagamento; cobrança paga não é recriada nem apagada.
7. **Operação recusada que deixa registro** (mensagem de DDD, pedido de vínculo) devolve `persistir: true`; do contrário o estado volta ao anterior.
8. **Estado do app é clonado a cada alteração** (`structuredClone` em `mutate`); nunca altere `state` direto fora de `mutate`.
9. **Artifact:** um único HTML (`dist/agenda.html`), sem rede (exceto o `<link>` do Google Fonts, com fonte de reserva), tema claro e escuro por tokens, funciona em 390 px sem rolagem horizontal, título "Agendz".
10. **Autoria:** arquivo novo em `src/` recebe o cabeçalho com `npm run autoria` (o teste estático falha sem ele). A chave `segredo-autoria.txt` (ou `AUTORIA_SEGREDO`) fica **fora do projeto e do zip**; sem chave o build sai sem assinatura verificável.

## Como verificar (obrigatório antes de dizer que terminou)
- `npm run verificar` = testes de unidade + estáticos + build + navegador. Tem que passar inteiro.
- Atalhos: `npm test` (inclui `tests/estatico.test.mjs`), `npm run e2e`, `npm run build`.
- Todo bug corrigido ganha um teste que falha sem a correção. Todo teste de unidade novo é `tests/*.test.mjs` (o `npm test` pega sozinho); todo e2e novo é `tests/e2eN.mjs`.
- Se `npm run e2e` não rodar por falta do Chromium, diga isso ao dar o trabalho por concluído; não finja que passou.

## Entrega (nesta ordem; commit, push, deploy e Artifact só com autorização, fluxo A a F do `CLAUDE.md` da raiz)
1. `npm run verificar`.
2. `node build.mjs`; republicar o Artifact (mesma URL) só depois que a mudança estiver no ar e com autorização específica.
3. Atualizar a documentação da mudança: nova entrada em `docs/HISTORICO-VERSOES.md` (com as decisões sem confirmação) e os mapas/`ESTADO-DO-PROJETO.md` afetados.
4. Zip só se o Marcelo pedir (sem `node_modules` e `shots`): `zip -qr agendz.zip agendz -x "agendz/node_modules/*" "agendz/shots/*"`.
5. Resumo curto em português: o que mudou, o que passou, **decisões tomadas sem confirmação**, o que ficou em aberto.

## Estilo
- Português do Brasil em tudo que o usuário vê e nos comentários. Respostas curtas e diretas.
- Prototipar na API simulada com a rota REST no comentário (`// POST /clientes/...`), para a migração ao Spring Boot ser mecânica.
- Não pergunte o que dá para decidir com bom senso: decida, registre no histórico e avise.

## Regras herdadas do histórico (valem hoje)
- Fluxo do Marcelo: para cada pedido novo, mostre antes uma versão otimizada e curta do pedido (menos tokens, sem tirar a flexibilidade e o bom senso) e execute em seguida.
- Entrega (pedido do Marcelo, 29/10 12:13): **só republique o Artifact depois que a mudança estiver disponível** (commit no git, CI verde, deploy na VPS e DNS respondendo). Ordem: verificar → commit/push → CI e deploy verdes → só então publicar o Artifact. Se bater o limite de uso, espere redefinir e continue sem pedir confirmação, na ordem: barbearia → Apex → Admin → Planos (cota mensal acumula; excedente sai do mês seguinte; aviso só depois de agendar).
- **Lista "aguarda confirmação"** (`docs/AGUARDA-CONFIRMACAO.md`, pedido do Marcelo em 30/10 23:39): financeiro real, Pix e reCAPTCHA só se fazem depois de ele confirmar por escrito; nunca entram na fila sozinhos.

## Agendz (plataforma multi-tenant, a caminho)
- **Ids neutros (v71):** o profissional é `profissionalId` / `papel: 'profissional'` (não existe mais `esteticistaId`); "esteticista" e "barbeiro" só aparecem como **rótulo** do tipo (`rot('profissional')`). Funções e testids seguem: `SeletorProfissionais`, `relatorioDoProfissional`, `atender-profissional`.
- O nome da plataforma é **Agendz**; a Apex é o primeiro cliente (tenant), não o nome do app. Fases F0 a F7 e regras multi-tenant: `docs/F*.md` e `docs/ESTADO-DO-PROJETO.md`.
- **Pastas por tipo:** tudo que é de um tipo mora em `src/tipos/<tipo>/` (`definicao.js` = capacidades, rótulos, `vocab`, `visual`, `exemplo`; `seed.js`; `templates.js`; `tema.css`; a Apex também tem `logo-apex.js`). `src/domain/tipos.js` só registra os tipos. Tipo novo = pasta nova + uma linha no registro. Texto que muda por tipo vai em `vocab` (`voc`/`Voc`), nunca `if (tipo === ...)`; `<html data-tipo>` carrega o tema. Equivalência com a barbearia v64 e tabela de exceções: `docs/EQUIVALENCIA-BARBEARIA.md` (suíte dela: `npm run testar:barbearia`; as duas: `npm run verificar-tudo`).
- **A loja vem do endereço** (`domain/tenant.js` `resolverLoja`, `services/lojas-demo.js`, spec `docs/F1-lojas-por-dns.md`): domínio próprio > subdomínio > `/agendar/{slug}` > `?loja=` (só demo). Da loja saem tipo, dados e marca; endereço desconhecido = "Loja não encontrada", nunca loja padrão. Cada loja tem estado próprio (`store.entrarNaLoja`). O seletor do Login existe **só na demonstração**, quando o build e o endereço não decidem; nunca em produção. Sem logo, a marca é o **ícone do tipo** (`visual.iconeMarca`), nunca a logo de outra loja.
- **Deploy na VPS** (`deploy/`, README dentro): Caddy + front estático hoje; API/PostgreSQL na F1 (blocos comentados); `AGENDZ_DOMINIO=dominio node build.mjs` (ou `deploy/montar-site.sh`) acrescenta o domínio real às lojas por subdomínio e desliga `?loja=`. Sem backup diário pago: `pg_dump` diário para fora (`deploy/backup/`) + semanal grátis + snapshot antes de mudança grande. Scripts só passaram em checagem de sintaxe (sem Docker/Caddy aqui).
- **Tipo de estabelecimento** (`src/domain/tipos.js`, spec `docs/F0-tipos-de-estabelecimento.md`): definido na criação da loja e **nunca muda** (`estabelecimento.salvar` recusa `tipo` diferente; a tela mostra só leitura). A tela pergunta a **capacidade** (`cap`/`capAtiva`), nunca "é estética?". Texto visível **nunca** traz "esteticista" escrito: use `rot/Rot/rots/Rots('profissional')`. Mapa ou constante lida **na carga do módulo** não pode usar `rot` (congela o tipo): use `get` ou função. `tests/tipos.test.mjs` falha com texto fixo. Tipo novo = entrada nova em `TIPOS`.
- O nome Agendz já vale no título da aba, nos cabeçalhos de autoria, no pacote e nos documentos. **Apex** é só o nome da loja (tenant) nos dados de exemplo (`src/tipos/estetica_automotiva/seed.js`, `logo-apex.js`, e-mails de exemplo). Texto que o cliente ou a equipe lê **nunca** fixa o nome de uma loja: use o nome do estabelecimento (`estabelecimento.nome`) ou "a loja".

## Apex Estética Automotiva (o que muda em relação à barbearia)
- Projeto separado, copiado da agenda da barbearia (que continua intacta). Esteticista no lugar de barbeiro; histórico da v64 em `docs/HISTORICO-VERSOES.md` e `docs/EQUIVALENCIA-BARBEARIA.md`.
- **Box** é recurso como o esteticista: nunca duplica (`acharConflitos`, `escolherBox`, `ocupacao`/`ocupacaoDe`); atendimento local tem `boxId: null`. Boxes: Estabelecimento > Boxes.
- **Veículo e porte** (`domain/veiculos.js`): placa antiga ou Mercosul só por formato; agendamento guarda `veiculoId`, `veiculo` (foto), `porte` e `precos` congelados; serviço automotivo exige veículo, só produto não. Preço/duração vêm de `precos`/`duracoes` por porte (`servicoNoPorte`, `servicosPorIds(state, ids, porte)`); nunca leia `s.preco` direto para cobrar.
- **Vários dias** (`multiDia`) consomem blocos de trabalho e ocupam o box até a retirada; **combo** usa `componentes`.
- Marcadores `a.emServico` e `a.pronto` sobre Confirmado (`visualDoCartao`); "Pronto" avisa o cliente.
- **Tema e marca:** escuro no `:root`, claro só em `:root[data-theme="light"]`; **proibido** `prefers-color-scheme`. Preto + verde `#4ada54` → lima `#d9e652` (da logo). A marca é a **imagem** da logo da loja (`LogoMarca`; a da Apex vem de `src/tipos/estetica_automotiva/logo-apex.js`); sem logo cai no ícone do tipo, nunca na logo de outra loja; não crie ícone de "A" em texto. Cor de marca só por `tema.js`.
- **Loja:** expediente 09:00–20:00 de segunda a sábado (`escalaApex` no seed), endereço em `estabelecimento.endereco`. Usuários de exemplo: Davi (dono), Pablo e Marcelo (esteticistas).
- Testes: `tests/apex.test.mjs` (unidade) e `tests/e2e30.mjs`; helpers de fluxo com veículo em `tests/e2e-util.mjs` (`waVeiculoNovo`, `waServico`, `salvarAtender`, `pubVeiculo`). Todo e2e que salva no Atender ou no link precisa de veículo.
- Arquivos novos em `src/` e `tests/` levam cabeçalho com `ref:0000000000` até o dono rodar `npm run autoria` com a chave (fora do projeto e do zip).
- Skills (checklist de trabalho): valem as **skills instaladas** (`agendz-*`, mais completas). As cópias em `docs/skills/agendz-*.md` são de 26/10, resumidas e desatualizadas; mantidas só como registro, não as siga se divergirem.

## Histórico de versões
O registro de cada versão (v54 em diante) está em `docs/HISTORICO-VERSOES.md`. Consulte com `grep` quando precisar do porquê de uma regra; não carregue o arquivo inteiro.
