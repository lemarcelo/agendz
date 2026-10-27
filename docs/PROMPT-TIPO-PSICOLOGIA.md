# Prompt executável: novo tipo de estabelecimento "Psicologia e terapia" (`psicologia`)

> Pedido do Marcelo em 27/10 (16:17): outro modelo de negócio para **psicólogos, terapeutas e psicoterapeutas**, com serviços do tipo que a área presta (terapia individual, terapia de casal etc.). Pronto para executar direto; as dúvidas têm decisão (seção 10). Regras fixas do `CLAUDE.md` valem; método de tipo novo: `docs/F0-tipos-de-estabelecimento.md` ("tipo novo = pasta nova + uma linha no registro"). **Lugar na fila:** depois do item 7 (estética) e antes do 8; não bloqueia o painel.

## 1. Alvo e escopo da versão 1
- **Quem usa:** o profissional **autônomo** (consultório de 1 pessoa: dono = quem atende) e a **clínica pequena** (dono + 2 a 6 profissionais, uma recepção). Cobrança do Agendz por **agenda = profissional que atende** (igual à barbearia).
- **Entra na v1:** agenda de sessões, serviços do tipo, modalidade presencial/online, sessão de casal/família (titular + acompanhante), horário fixo semanal/quinzenal (recorrência), link público de agendamento, lembretes **discretos**, Pix, cadastro de pacientes **privado por profissional**, LGPD básica.
- **Fica FORA da v1 (de propósito):** prontuário/evolução clínica, laudos, testes, qualquer conteúdo clínico, grupo com vagas, pacotes de avaliação, nota fiscal/recibo. Entram só por decisão do Marcelo e revisão jurídica (fases P5 e P6).

## 2. Capacidades (`src/tipos/psicologia/definicao.js`)
Reaproveita o catálogo de capacidades; nenhuma tela pergunta "é psicologia?" (usa `cap`). Valores:
| Capacidade | Valor | Observação |
|---|---|---|
| `usaVeiculo`, `precoPorPorte`, `multiDia`, `prontoParaRetirada` | não | |
| `usaRecursoFisico` | **opcional, desligado** | clínica com várias salas liga em Estabelecimento (rótulo "Sala"); sala nunca duplica (`acharConflitos`) |
| **novo** `modalidade` | sim | cada sessão é `presencial` ou `online`; serviço define o que aceita (`modalidades`) |
| **novo** `acompanhantes` | sim | serviço com `participantes` (1, 2 casal, até 6 família); a sessão tem `acompanhantes: [nome]` (só nome, sem cadastro) |
| **novo** `recorrencia` | sim | horário fixo semanal/quinzenal: gera as próximas N sessões (padrão 8), cada uma passa por `validarHorario` |
| **novo** `pacientesPrivados` | sim | cada profissional só vê **os próprios** pacientes (seção 6) |
| **novo** `usaProdutos`, `usaEstoque`, `usaCupom` | **não** | esconde Produtos, Material/estoque e Cupons; comissão vira "Repasse" (`vocab`) e continua opcional |
Capacidade nova entra em **todos** os tipos (os atuais com o valor que já têm de fato) e no teste `tests/tipos.test.mjs`.

## 3. Rótulos e vocabulário
- `profissional`: **terapeuta** (cobre psicólogo, psicoterapeuta e terapeuta, vale para homem e mulher; se o artigo depender de `g`, evite frases com artigo ou acrescente `g: 'n'` tratado em `artigo()` sem quebrar `m`/`f`). `recurso`: sala. `loja`: consultório. `atendimento`: sessão. **Novo rótulo `cliente`: paciente** (nos outros tipos continua "cliente"; troque os textos fixos por `rot('cliente')`, com teste que procura "cliente" fixo, como já se faz com "esteticista").
- `vocab`: confirmação ("confirmação de sessão"), saudação neutra sem emoji, exemplos fictícios (`exemploServicosVale` etc. ou ocultar vale/cupom), "Repasse" no lugar de comissão, dica de materiais desligada.
- `visual`: tema calmo (fundo claro quente e escuro suave, destaque verde-sálvia ou azul acinzentado com contraste ≥ 4,5, por `tema.js`), ícone da marca = um dos existentes em `src/ui/icones.js` (sugestão `users` ou `msg`; se quiser folha/coração, acrescente o ícone ali) e `tema.css` próprio. Sem logo, a marca é o ícone do tipo.

## 4. Serviços de exemplo (`src/tipos/psicologia/catalogo.js`, como `barbearia/catalogo.js`; fora do seed, usados pelo assistente de primeiro acesso)
Preço e duração são **sugestões editáveis**, sem pretensão de tabela oficial; o dono ajusta no assistente. Categorias e itens:
- **Psicoterapia individual:** Primeira sessão / acolhimento (50 min) · Psicoterapia adulto (50) · Psicoterapia de adolescente (50) · Psicoterapia infantil (50) · Plantão psicológico (30) · Sessão de retorno (30).
- **Casal e família:** Terapia de casal (60, `participantes: 2`) · Terapia de família (60, até 5) · Orientação de pais e cuidadores (50) · Mediação / sessão conjunta (60).
- **Avaliação:** Avaliação psicológica (sessão, 50) · Devolutiva de avaliação (50) · Orientação vocacional e de carreira (50).
- **Temas e abordagens específicas:** Terapia do luto (50) · Terapia sexual (50) · Acompanhamento de ansiedade e depressão (50) · Orientação para gestantes e puérperas (50) · Hipnoterapia / EMDR e similares (60, "abordagem do profissional").
- **Outros serviços:** Supervisão clínica (60) · Orientação a empresas / palestra (consulta, sob orçamento) · Sessão avulsa online (50, `modalidades: [online]`).
Cada um com `chave`, `nome`, `categoria`, `preco`, `duracaoMin`, `participantes`, `modalidades`. `catalogoDoTipo` junta seed + extras; gerar `backend/src/main/resources/catalogo/psicologia.json` com `node tools/gerar-catalogo.mjs` (teste de igualdade já existe). O seed (demonstração) tem só 4 serviços.
**Serviços por profissional (item 6c) é obrigatório neste tipo:** cada terapeuta marca o que realiza (quem não faz terapia sexual ou infantil não aparece para esse serviço).

## 5. Fluxos
- **Modalidade:** sessão online guarda `modalidade` e o **link da videochamada** que o próprio profissional informa (campo no perfil dele e, se quiser, por sessão); o Agendz **não gera** sala nem integra provedor na v1. O link só vai ao paciente no lembrete e nunca aparece em lista de aviso nem em log. Sessão presencial mostra o endereço do consultório (`estabelecimento.endereco`).
- **Casal/família:** `participantes > 1` no serviço pede os nomes dos acompanhantes (texto curto, até 5); o cadastro do paciente é só o **titular** (quem paga e recebe aviso). Conflito de horário continua pelo profissional (e sala).
- **Horário fixo:** "Repetir toda semana/quinzena" ao agendar; mostra as datas geradas e quais deram conflito (nunca sobrescreve; o profissional resolve). Cancelar uma sessão não cancela as outras; "encerrar horário fixo" apaga as futuras não confirmadas. Regras de 24 h de cancelamento, remarcação, DDD e status continuam as do sistema; **falta cobrada** é opção por consultório (padrão: desligada) e só marca o atendimento, sem cobrar sozinha.
- **Link público (`#agendar`):** mostra serviços e horários livres (nunca quem ocupa), escolha de modalidade, aceite obrigatório do uso dos dados e dos lembretes (texto na seção 6) e campo de telefone. Nome de serviço sensível aparece só como a loja oferece; o que o paciente escolheu **nunca** vai para lista de espera de terceiros.
- **Assistente de primeiro acesso:** mesmos passos (senha e usuário, serviços, equipe, expediente, pronto), com passo opcional **Modalidade** (presencial, online ou os dois; endereço e link padrão) e passo **Salas** só se o dono ligar sala. `catalogo/psicologia.json` agrupa por categoria (`pa-categoria-N`).

## 6. Sigilo, LGPD e ética (o que muda em relação aos outros tipos)
Saber que alguém é paciente de psicólogo já é **dado de saúde, sensível** (LGPD, art. 5º II e art. 11). Por isso, para este tipo:
1. **Nenhum dado pessoal em log**, nem nome nem apelido (isto **substitui**, só aqui, a regra "nome e apelido podem ir ao log" de `docs/MAPA-DADOS-PESSOAIS.md`): ids opacos nos logs, teste que procura nome de paciente na saída de log. Telefone, CPF e nascimento continuam cifrados.
2. **Mensagens discretas:** lembrete, confirmação, cancelamento e "link da sessão" dizem "sua sessão com {terapeuta} em {data} às {hora}", **sem** o nome do serviço ("terapia de casal", "avaliação") nem a palavra "paciente". Modelos próprios em `src/tipos/psicologia/templates.js` (formato Meta, sem emoji, tom acolhedor), testados contra uma lista de palavras proibidas.
3. **Cadastro privado por profissional (`pacientesPrivados`):** o terapeuta só lista e abre os pacientes que ele atendeu ou cadastrou; outro terapeuta da clínica não vê (nem na busca nem no Atender). Dono e recepção veem **nome, telefone e horários** (para agendar e cobrar), nunca anotações. Atendimento local e link público respeitam o mesmo filtro. Teste de IDOR entre dois terapeutas da mesma loja, além do de isolamento entre lojas.
4. **Consentimento:** aceite registrado (data, texto da versão) para uso dos dados e lembretes, no link público e no primeiro cadastro; texto curto, sem juridiquês, editável por consultório; política de privacidade do Agendz linkada. O consultório é o controlador e o Agendz o operador: **o Marcelo precisa de um contrato de operador de dados** antes do primeiro cliente deste tipo (ver pendências).
5. **Direitos do titular:** "Anonimizar paciente" (dono ou o próprio terapeuta): troca nome por "Paciente removido", apaga telefone e acompanhantes, mantém horários e valores para o financeiro; registra a ação.
6. **Conteúdo clínico:** o sistema **não tem** campo de anotação clínica na v1. Observação de agendamento é só logística (limite 200 caracteres, aviso "não escreva informações clínicas aqui").
7. **Regras profissionais** (Código de Ética e normas de atendimento online do Conselho Federal de Psicologia, que incluem cadastro do profissional na plataforma do CFP para atendimento online): o sistema não faz diagnóstico nem avalia ninguém; confira a resolução vigente com o CRP antes de divulgar o recurso de sessão online. Não prometa conformidade; diga que a responsabilidade ética é do profissional.

## 7. Backend e migração
`V10+`: acrescenta `'psicologia'` a `tipo_estabelecimento` (insert simples, sem apagar nada); colunas novas: `agendamento.modalidade`, `agendamento.link_online` (cifrado ou só leitura do dono do agendamento), `agendamento.acompanhantes` (texto cifrado, máx. 5), `servico.participantes`, `servico.modalidades`, `usuario.link_online`, `horario_fixo` (loja_id, profissional_id, regra, até) com RLS, FK composta e teste de isolamento; `cliente.profissional_id` (dono do cadastro) com política de leitura por profissional **na API e no banco** (RLS por papel ou filtro obrigatório no serviço, com teste). `CatalogoDeServicos` lê `catalogo/psicologia.json`. `provisionar-loja.sh`, o painel (`docs/PROMPT-PAINEL-ADMIN.md`, lista de tipos) e `docs/MAPA-API-SPRING.md` ganham o tipo. Java só compila no CI.

## 8. Fases (cada uma com testes, `npm run verificar`, `npm run testar:barbearia`, `npm run testar:apex` quando houver e CI verde)
- **P0 Especificação:** este documento aprovado; atualizar `docs/F0-tipos-de-estabelecimento.md` (D1/D2 com a coluna Psicologia e as capacidades novas) e `docs/EQUIVALENCIA-BARBEARIA.md` (nada muda para os tipos atuais).
- **P1 Tipo no catálogo:** `src/tipos/psicologia/` (definicao, seed fictício, templates, tema.css, catalogo.js), linha em `tipos.js`, rótulo `cliente`, capacidades novas em todos os tipos, esconder Produtos/Estoque/Cupons por capacidade, loja de demonstração (`lojas-demo.js`: "Consultório Aurora", nomes e pacientes **fictícios**), `tests/psicologia.test.mjs` + `tests/e2e39.mjs` (computador e 390 px com fonte larga, claro e escuro), Artifact republicado.
- **P2 Modalidade online:** link do profissional, campo na sessão, lembrete com link, testes (link nunca em log/aviso).
- **P3 Casal/família e horário fixo:** acompanhantes e recorrência com conflitos, testes em `tests/conflitos.test.mjs`.
- **P4 Sigilo:** pacientes privados por profissional, log sem dados pessoais, aceite LGPD, anonimizar, palavras proibidas nas mensagens, teste de IDOR entre terapeutas. **Nenhum cliente real deste tipo antes da P4 e do contrato de operador.**
- **P5 (opcional, só se o Marcelo pedir):** grupo com vagas, pacotes de avaliação, recibo simples.
- **P6 (opcional, só com decisão e revisão jurídica):** prontuário/evolução cifrado por campo, visível só ao autor, auditoria de leitura, prazo de guarda e exclusão.

## 9. Testes obrigatórios (além dos de cada fase)
`tests/tipos.test.mjs` (sem texto fixo "cliente", "barbeiro" ou "esteticista" onde há rótulo); mensagens sem palavra proibida; dois terapeutas da mesma loja não se veem; log sem nome; link público sem quem ocupa; conflito de sessão e sala; recorrência com conflito; capacidade desligada esconde Produtos/Cupom/Estoque na UI **e** recusa na API; catálogo gerado igual ao seed+extras; 390 px sem rolagem lateral.

## 10. Decisões já tomadas (diga se discorda) e pendências do Marcelo
- Nome do tipo na tela: **Psicologia e terapia**; slug `psicologia`; rótulo do profissional **terapeuta**, do cliente **paciente**.
- v1 **sem prontuário**; sessão online com link informado pelo profissional (sem integração); sem grupo/pacote/recibo.
- Mensagens **sempre discretas**; nome de paciente nunca em log neste tipo.
- Cobrança do Agendz: por profissional que atende (agenda), como na barbearia.
- **Depende do Marcelo:** (1) contrato de operador de dados / termos de uso e política de privacidade para este tipo, ideal com um advogado, **antes do primeiro cliente**; (2) conferir com um psicólogo conhecido (ou o CRP) os textos de sigilo e a parte de atendimento online; (3) escolher o primeiro consultório-piloto (nome fictício até lá); (4) confirmar a regra de recepção ver nome/telefone/horários e nunca anotações.
