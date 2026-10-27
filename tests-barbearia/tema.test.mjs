// Logo e cores da marca: validação da imagem, cor dominante, contraste da paleta e entrada segura no CSS. Cores de status por situação.
import test from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, estabelecimento } from '../src/services/api.js';
import { contraste, coresDominantes, corDominante, corValida, cssDaMarca, logoValida, paletaDoTema, coresDoTema, PALETAS, TEMAS_VALIDOS, rgbParaHsl, hexParaRgb, LOGO_MAX } from '../src/domain/tema.js';
import * as R from '../src/domain/rules.js';

const PNG = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0]).toString('base64')}`;
const login = (a) => assert.ok(auth.login({ identificador: a, senha: '1234' }).ok);
test.beforeEach(() => store.reiniciar());

test('logo: só PNG, JPEG ou WebP em base64 com o cabeçalho certo; SVG, texto, tipo trocado e tamanho excessivo são recusados', () => {
  assert.equal(logoValida(PNG), true);
  assert.equal(logoValida(PNG.replace('image/png', 'image/jpeg')), false, 'cabeçalho PNG declarado como JPEG');
  assert.equal(logoValida('data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+'), false);
  assert.equal(logoValida(`data:image/png;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`), false);
  assert.equal(logoValida('https://exemplo.com/logo.png'), false);
  assert.equal(logoValida(`${PNG}"); } body { display:none } /*`), false, 'não deixa sair do url()');
  assert.equal(logoValida(PNG + 'A'.repeat(LOGO_MAX)), false);
  for (const x of [null, undefined, 5, {}, []]) assert.equal(logoValida(x), false);
});

test('cor dominante: pega a cor marcante, ignora transparente/branco/preto e devolve cinza para logo sem cor', () => {
  const px = (...cores) => Uint8ClampedArray.from(cores.flatMap(([r, g, b, a = 255, n = 1]) => Array.from({ length: n }, () => [r, g, b, a]).flat()));
  assert.match(corDominante(px([180, 40, 30, 255, 30], [255, 255, 255, 255, 200], [0, 0, 0, 255, 100], [10, 10, 10, 0, 100])), /^#b/i);
  assert.equal(corDominante(px([255, 255, 255, 255, 50], [0, 0, 0, 255, 50])), null);
  const c = corDominante(px([120, 120, 120, 255, 50]));
  assert.equal(c, '#787878');
  assert.equal(corValida('#a83226'), true); assert.equal(corValida('a83226'), false); assert.equal(corValida('#a83226; x'), false);
});

const pontas = (g) => g.match(/#[0-9a-f]{6}/gi);
test('cor do tema: em todas as paletas e em logos de várias cores, o texto sobre o degradê passa em 4,5 nas duas pontas, nos dois temas', () => {
  const casos = [...PALETAS.map((x) => ({ temaCor: x.id })), ...['#a83226', '#1d4ed8', '#f5c400', '#0f6b5c', '#7a2fb5', '#787878', '#ffd1dc', '#202020'].map((c) => ({ temaCor: 'logo', corTema: c }))];
  for (const e of casos) {
    const p = paletaDoTema(e);
    for (const [modo, tk] of [['claro', p.claro], ['escuro', p.escuro]]) {
      for (const [grad, fg] of [['--tema-topo', '--tema-topo-fg'], ['--tema-btn', '--tema-btn-fg']]) {
        const [x, y] = pontas(tk[grad]);
        assert.ok(contraste(x, tk[fg]) >= 4.5 && contraste(y, tk[fg]) >= 4.5, `${e.temaCor}${e.corTema || ''} ${modo} ${grad}: ${x} ${y} com ${tk[fg]}`);
        assert.notEqual(x, y, `${e.temaCor} ${modo} ${grad}: degradê com duas pontas diferentes`);
      }
    }
    assert.ok(contraste(p.claro['--acento'], '#f4f1ea') >= 3, `destaque claro ${e.temaCor}`);
    assert.ok(contraste(p.escuro['--acento'], '#141517') >= 4.5, `destaque escuro ${e.temaCor}`);
    assert.equal('--bg' in p.claro, false, 'fundo e cartões ficam neutros: o tema não mexe neles');
    assert.equal('--surface' in p.claro, false);
  }
});

test('duas cores da logo: a segunda tem matiz diferente quando existe; logo de uma cor só ganha uma variação', () => {
  const px = (...cores) => Uint8ClampedArray.from(cores.flatMap(([r, g, b, a = 255, n = 1]) => Array.from({ length: n }, () => [r, g, b, a]).flat()));
  const [c1, c2] = coresDominantes(px([180, 40, 30, 255, 60], [30, 70, 180, 255, 40], [255, 255, 255, 255, 100]));
  assert.match(c1, /^#b/i); assert.match(c2, /^#[0-3]/i, 'azul como segunda cor');
  const [u1, u2] = coresDominantes(px([180, 40, 30, 255, 60]));
  assert.notEqual(u1, u2);
  assert.ok(Math.abs(rgbParaHsl(...hexParaRgb(u1))[0] - rgbParaHsl(...hexParaRgb(u2))[0]) < 30, 'mesma família de cor');
  assert.equal(coresDominantes(px([255, 255, 255, 255, 50], [0, 0, 0, 255, 50])), null);
  assert.equal(corDominante(px([120, 120, 120, 255, 50])), '#787878');
});

test('coresDoTema: padrão e logo sem cor não geram degradê; paleta e logo geram', () => {
  assert.equal(coresDoTema({}), null); assert.equal(coresDoTema({ temaCor: 'padrao' }), null);
  assert.equal(coresDoTema({ temaCor: 'logo' }), null, 'logo sem cor');
  assert.equal(coresDoTema({ temaCor: 'inexistente' }), null);
  assert.equal(coresDoTema({ temaCor: 'vinho' }).length, 2);
  assert.deepEqual(coresDoTema({ temaCor: 'logo', corTema: '#112233', corTema2: '#445566' }), ['#112233', '#445566']);
  assert.equal(paletaDoTema({ temaCor: 'padrao' }), null);
});

test('CSS da marca: só sai texto validado; padrão sem logo não gera nada; tema sem logo gera degradê e logo sem tema gera só o fundo', () => {
  assert.equal(cssDaMarca({}), '');
  assert.equal(cssDaMarca({ temaCor: 'padrao' }), '');
  assert.equal(cssDaMarca({ logo: 'javascript:alert(1)', corTema: 'red; } body{display:none', temaCor: 'logo' }), '');
  const css = cssDaMarca({ logo: PNG, corTema: '#a83226', temaCor: 'logo' });
  assert.match(css, /--tema-topo: linear-gradient/); assert.match(css, /--logo-fundo: url\("data:image\/png/); assert.match(css, /prefers-color-scheme: dark/); assert.match(css, /data-theme="dark"/);
  const so = cssDaMarca({ logo: PNG, corTema: '#a83226', temaCor: 'padrao' });
  assert.doesNotMatch(so, /--tema-topo/); assert.match(so, /--logo-fundo/);
  const pal = cssDaMarca({ temaCor: 'petroleo' });
  assert.match(pal, /--tema-btn: linear-gradient/); assert.doesNotMatch(pal, /--logo-fundo/);
  assert.equal(cssDaMarca({ temaCor: 'x; } body{display:none' }), '', 'id fora da lista não entra no CSS');
});

test('API: só quem edita o estabelecimento troca a logo; entrada inválida é recusada; cor fica em minúsculas', () => {
  assert.equal(estabelecimento.salvar({ logo: PNG, corTema: '#A83226' }).ok, false, 'sem login');
  login('kiko');
  assert.equal(estabelecimento.salvar({ logo: PNG }).ok, false, 'barbeiro não altera a marca');
  auth.logout(); login('alan');
  for (const d of [{ logo: 'x' }, { logo: 5 }, { logo: PNG.replace('image/png', 'image/svg+xml') }, { corTema: 'azul' }, { corTema: '#12345' }, { corTema2: 'verde' }, { temaCor: 'x' }, { temaCor: 'logo' }]) assert.equal(estabelecimento.salvar(d).ok, false, JSON.stringify(d).slice(0, 40));
  assert.ok(estabelecimento.salvar({ logo: PNG, corTema: '#A83226', corTema2: '#1D4ED8' }).ok);
  const e = store.getState().estabelecimento;
  assert.equal(e.logo, PNG); assert.equal(e.corTema, '#a83226'); assert.equal(e.corTema2, '#1d4ed8');
  assert.equal(e.temaCor, 'padrao', 'subir a logo não muda o tema sozinho');
  assert.ok(estabelecimento.salvar({ temaCor: 'logo' }).ok);
  assert.equal(store.getState().estabelecimento.temaCor, 'logo');
  assert.ok(estabelecimento.salvar({ logo: null }).ok);
  const dep = store.getState().estabelecimento;
  assert.equal(dep.logo, null); assert.equal(dep.corTema, null); assert.equal(dep.corTema2, null);
  assert.equal(dep.temaCor, 'padrao', 'sem logo, o tema "logo" volta ao padrão');
  assert.equal(estabelecimento.salvar({ temaCor: 'logo' }).ok, false, 'sem logo não dá para usar as cores dela');
  for (const id of TEMAS_VALIDOS.filter((x) => x !== 'logo')) assert.ok(estabelecimento.salvar({ temaCor: id }).ok, id);
});

test('cores de status: a confirmar amarelo, confirmado azul, concluído verde, sem resposta vermelho, cancelado cinza', () => {
  const base = { plano: [{ estado: 'pendente' }], inicio: Date.now() + 5 * 864e5 };
  assert.equal(R.statusVisual({ ...base, status: 'a_confirmar' }, Date.now()).chave, 'amarelo');
  assert.equal(R.statusVisual({ ...base, status: 'confirmado' }, Date.now()).chave, 'azul');
  const c = R.statusVisual({ ...base, status: 'concluido' }, Date.now());
  assert.equal(c.chave, 'verde'); assert.equal(c.check, true);
  assert.equal(R.statusVisual({ ...base, status: 'a_confirmar', plano: [{ estado: 'enviada' }] }, Date.now()).chave, 'vermelho');
  assert.equal(R.statusVisual({ ...base, status: 'cancelado' }, Date.now()).chave, 'cinza');
});

test('logo cinza ou preta gera degradê neutro (sem tom avermelhado) e o anel de foco nunca muda', () => {
  for (const hex of ['#808080', '#111111', '#7f7f80']) {
    const p = paletaDoTema({ temaCor: 'logo', corTema: hex });
    for (const modo of [p.claro, p.escuro]) {
      assert.equal('--focus' in modo, false, 'foco fica fixo no azul padrão');
      for (const c of [...pontas(modo['--tema-topo']), ...pontas(modo['--tema-btn'])]) {
        const [, s] = rgbParaHsl(...hexParaRgb(c));
        assert.ok(s < 0.2, `${hex} ${c} deveria ser quase cinza`);
      }
    }
  }
});
