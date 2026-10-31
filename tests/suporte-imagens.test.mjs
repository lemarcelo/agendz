/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Imagens no chamado de suporte (v110), na API simulada e nas regras puras: o tipo vem do CONTEÚDO (SVG, GIF, HTML e PDF nunca), até 3 por mensagem, 1,5 MB cada,
// os bytes não aparecem na resposta, outro usuário não alcança a imagem (igual a não existir) e mensagem recusada não grava nada. O servidor repete tudo
// (ImagensDoChamado, AnexosTest, SuporteChamadosTest).
import test from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, suporte } from '../src/services/api.js';
import { MAX_BYTES, conferirImagens, tipoPorConteudo } from '../src/domain/imagem-chamado.js';
import { reiniciar } from './helpers.mjs';

const st = () => store.getState();
const como = (u) => assert.ok(auth.login({ identificador: u, senha: '1234' }).ok, u);
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const png = (extra = 8) => b64(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), Buffer.alloc(extra)]));
const jpeg = () => b64(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]), Buffer.alloc(8)]));
const webp = () => b64(Buffer.from('RIFF\0\0\0\0WEBPVP8 abcdefgh', 'latin1'));
const svg = () => b64(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
const base = { assunto: 'Veja o erro', categoria: 'problema', texto: 'Segue o print.' };
// v119: de fábrica só o proprietário abre chamados; estes testes liberam a seção Suporte para os profissionais e a atendente (a regra padrão tem teste próprio).
test.beforeEach(() => { reiniciar(); for (const u of store.getState().usuarios) if (u.papel !== 'dono') u.permissoes = { ...(u.permissoes || {}), suporte: true }; });

test('o tipo vem dos primeiros bytes: PNG, JPEG e WebP passam; SVG, GIF, HTML, PDF e vazio não', () => {
  assert.equal(tipoPorConteudo(Buffer.from(png(), 'base64')), 'image/png');
  assert.equal(tipoPorConteudo(Buffer.from(jpeg(), 'base64')), 'image/jpeg');
  assert.equal(tipoPorConteudo(Buffer.from(webp(), 'base64')), 'image/webp');
  for (const t of ['<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'GIF89a\x01\0\x01\0\0\0\0;;;;', '<html><body>oi</body></html>', '%PDF-1.7\n1 0 obj\n', '']) assert.equal(tipoPorConteudo(Buffer.from(t, 'latin1')), '', t);
});

test('conferirImagens: até 3, 1,5 MB cada, base64 de verdade e tipo certo; qualquer defeito recusa tudo', () => {
  assert.equal(conferirImagens(undefined).ok, true);
  assert.equal(conferirImagens([png(), jpeg(), webp()]).anexos.length, 3);
  assert.match(conferirImagens([png(), png(), png(), png()]).erro, /Até 3/);
  assert.match(conferirImagens([svg()]).erro, /PNG, JPEG ou WebP/);
  assert.match(conferirImagens(['isto não é base64!!']).erro, /inválida/);
  assert.match(conferirImagens([png(MAX_BYTES)]).erro, /grande demais/);
  assert.equal(conferirImagens([png(), svg()]).ok, false, 'uma ruim derruba a mensagem inteira');
});

test('abrir com imagens: os bytes ficam no estado e só o resumo (id, tipo, tamanho) sai na resposta', () => {
  como('pablo');
  const r = suporte.abrir({ ...base, anexos: [png(), jpeg()] });
  assert.equal(r.ok, true);
  const anexos = r.chamado.msgs[0].anexos;
  assert.equal(anexos.length, 2);
  assert.deepEqual(Object.keys(anexos[0]).sort(), ['id', 'tamanho', 'tipo']);
  assert.ok(!JSON.stringify(r).includes(png()), 'os bytes não vão na resposta');
  assert.equal(st().suporteChamados[0].msgs[0].anexos[0].dados, png());
  const img = suporte.imagem(r.chamado.id, anexos[0].id);
  assert.equal(img.ok, true);
  assert.equal(img.url, `data:image/png;base64,${png()}`);
});

test('imagem de SVG, de 4 em uma mensagem ou grande demais: recusada e nada é gravado', () => {
  como('pablo');
  for (const anexos of [[svg()], [png(), png(), png(), png()], [png(MAX_BYTES)]]) {
    const r = suporte.abrir({ ...base, anexos });
    assert.equal(r.ok, false);
  }
  assert.equal((st().suporteChamados || []).length, 0);
  const id = suporte.abrir(base).chamado.id;
  const antes = st().suporteChamados[0].msgs.length;
  assert.equal(suporte.responder(id, 'olha', [svg()]).ok, false);
  assert.equal(st().suporteChamados[0].msgs.length, antes, 'resposta recusada não grava');
  assert.equal(suporte.responder(id, 'olha', [webp()]).ok, true);
});

test('outro usuário não alcança a imagem (igual a não existir); o dono da loja alcança', () => {
  como('pablo');
  const r = suporte.abrir({ ...base, anexos: [png()] });
  const [id, anexo] = [r.chamado.id, r.chamado.msgs[0].anexos[0].id];
  como('marcelo');
  assert.equal(suporte.imagem(id, anexo).ok, false, 'colega não vê');
  como('davi');
  assert.equal(suporte.imagem(id, anexo).ok, true, 'o dono vê a loja toda');
  assert.equal(suporte.imagem(id, 'ca999999').ok, false, 'imagem que não existe');
  auth.logout?.();
  assert.equal(suporte.imagem(id, anexo).ok, false, 'sem sessão nada funciona');
});
