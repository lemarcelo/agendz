---
name: agendz-manutencao-e-entrega
description: Use ao alterar qualquer coisa no Agendz (agenda multi-tenant React; tipos estética automotiva e barbearia): fluxo, testes de unidade e navegador, visual do Artifact, build, publicação e entrega.
---

# Manutenção, testes, visual e entrega do Agendz

Projeto: `/home/claude/agendz` (React 19 + esbuild, API simulada `src/services/api.js`, domínio puro `src/domain`, **tudo de um tipo em `src/tipos/<tipo>/`**). Regras fixas: `CLAUDE.md`. Documento vivo: `/home/claude/prompt-agendz-regras.md` (seção do assunto + "Histórico de implementação"). Artifact: `https://claude.ai/artifact/JVXrYoWFyrxi3nAEfo28QQ` (sempre `dist/agenda.html`, mesma `url`, sem `icon` na republicação, título "Agendz").

## Passos de toda mudança
1. Leia a seção do prompt afetada. Pedido claro = execute; ambiguidade que muda o resultado = pergunte uma vez; senão decida e registre em "decisões sem confirmação". Pedido novo: mostre antes uma versão curta e otimizada e execute em seguida.
2. Implemente: domínio (`src/domain`), depois `api.js` (permissão + `pegar/finito`, rota REST em comentário), depois a tela. Método novo de `api.js` entra em `docs/MAPA-API-SPRING.md`.
3. **Nada de `if (tipo === …)`:** o que muda por tipo é capacidade (`cap`/`capAtiva`), rótulo (`rot/Rot/rots/Rots`), frase (`voc/Voc` em `vocab`), visual (`visual`) ou arquivo em `src/tipos/<tipo>/`. Tipo novo = pasta nova + uma linha em `domain/tipos.js`. Exceção entre tipos vira linha em `docs/EQUIVALENCIA-BARBEARIA.md` ("O que muda por tipo").
4. Testes: unidade em `tests/*.test.mjs`, navegador em `tests/e2eN.mjs`; bug corrigido ganha teste que falha sem a correção.
5. **Verificação:** `npm run verificar` (estética) e `npm run verificar-tudo` (estética + suíte da barbearia v64: 381 + 29, `npm run testar:barbearia`). Jobs longos rodam destacados: `(nohup sh -c 'cmd > log 2>&1; echo "exit $?" >> log' >/dev/null 2>&1 &)` e espera com `until grep -q "^exit " log; do sleep 5; done` (sleep em primeiro plano é bloqueado). Sem Chromium, diga; não finja.
6. Prompt: atualize a seção e acrescente `### vN (data): título` no topo do histórico (pedido, feito, decisões sem confirmação, em aberto). Atualize `CLAUDE.md` se mudou regra fixa.
7. `node build.mjs`, publique o Artifact (uma frase do que mudou; não cole a URL), `cd /home/claude && rm -f agendz.zip && zip -qr agendz.zip agendz -x "agendz/node_modules/*" "agendz/shots/*"`, entregue com SendUserFile (zip, prompt, docs novos).
8. Resumo curto em português: o que mudou, o que passou, decisões sem confirmação, o que ficou em aberto. Gate 3 (isolamento entre lojas) sempre reportado com o motivo enquanto bloqueado (F1).

## Testes de navegador (Playwright)
- Runner `npm run e2e` (`tests/run-e2e.mjs`); app testado `dist/index.html` (rode `node build.mjs` antes). `import { chromium } from 'playwright'` só resolve de dentro do projeto; script de depuração vai em `tools/` e é apagado. Não rode `playwright install`.
- Relógio fixo: `ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'))`; colete `pageerror`, `dialog` e `console.error`; termine com `assert.deepEqual(erros, [])`. Modelo: `tests/e2e33.mjs`.
- Seletores por `data-testid` (`demo-<apelido>`, `nav-*`, `atender`, `demo-tipo-<tipo>`, `logo-marca`, `marca-icone`, `loja-nao-encontrada`…); tela nova já nasce com `data-testid`.
- Suíte da barbearia: `tools/importar-testes-barbearia.mjs` (só mapa de ids internos), `tools/rodar-testes-tipo.mjs barbearia [unidade|build|e2e]`; o build fixa o tipo com `AGENDZ_TIPO`.
- Estética: expediente 09:00–20:00 seg–sáb; fluxo que salva no Atender ou no link precisa de veículo (`tests/e2e-util.mjs`). Barbearia: sem veículo/box/porte; exemplo Alan, Kiko, Tailuan.
- Armadilhas: toast repetido (`.first()`); overlay bloqueia navegação (`Escape`); semana corrente já tem dias à frente; fontes bloqueadas no sandbox são inofensivas; rode com `timeout 170 node tests/eN.mjs`.
- **Auditoria de vazamento entre tipos** em tela nova: abra todas as telas, modais e o link do cliente nos dois tipos e procure termos do outro tipo (veículo, box, carro, esteticista × barbeiro, corte, cadeira, 💈) e imagens (a logo de uma loja nunca aparece em outra).

## Contrato visual do Artifact
- Um único HTML, sem rede (exceto Google Fonts com reserva), < 16 MB, 390 px sem rolagem horizontal (margem 16 px, filhos flex/grid com `min-width: 0`), sem `alert/confirm/prompt/window.print`. `localStorage` só para conveniência, com try/catch.
- Tema por tipo via `<html data-tipo>` e `src/tipos/<tipo>/tema.css`: estética escura por padrão (claro só em `[data-theme="light"]`, sem `prefers-color-scheme`); barbearia segue o sistema (creme/latão, alterna automático → escuro → claro). Cor de marca só por `src/domain/tema.js` (contraste ≥ 4,5, `tests/tema.test.mjs`).
- Marca: a logo da loja; **sem logo, o ícone do tipo** (`visual.iconeMarca`), nunca a logo de outra loja. Não existe ícone de letra em texto.
- Reaproveite `src/ui/common.jsx` (`Btn`, `Campo`, `Modal`, `Aviso`, `Icon`, `Interruptor`, `StatusChip`); listas ordenáveis usam `Abas ordem`/`Tabela id`/`useOrdem`; números com `tabular-nums`.
- Antes de publicar: capturas (computador e celular, escuro e claro, os dois tipos), **olhar as imagens**, `npm run verificar-tudo`.

## Armadilhas
- Arquivo novo em `src/` e `tests/` leva cabeçalho com `ref:0000000000` até o dono rodar `npm run autoria` com a chave (fora do projeto e do zip).
- Pacotes npm podem estar bloqueados: use `/opt/npm-tools`.
- Respostas ao Marcelo: curtas, em português, sem recapitular passos.
