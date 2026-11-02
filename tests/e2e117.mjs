/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// B10 parte B (reCAPTCHA no login e no link do cliente) no site real (dist/index-real.html) contra um servidor falso:
//  (a) loja com captchaChave de 30 letras: login responde 401 nas 5 primeiras, 428 na 6ª sem captcha; a caixa aparece (captcha), clicar em captcha-falso e entrar manda captcha: 'prova-boa';
//  (b) loja sem captchaChave: nunca aparece caixa e o 428 só mostra a mensagem;
//  (c) link do cliente (#agendar): o servidor falso responde 428 ao pedir horário sem X-Captcha e 201 com ele;
//  (d) 390 px com fonte larga (sem rolagem lateral, nav.semRolagem) e desktop × claro/escuro.
import assert from 'node:assert/strict';
import { abrirNavegador, id, ok, subirServidor } from './real-util.mjs';

const CORTE = id(50), ALAN = id(1);
const SELO = '1730000000.' + 'c'.repeat(32);
const CHAVE_30 = 'C'.repeat(30);
const LOJA_COM = { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null, captchaChave: CHAVE_30 };
const LOJA_SEM = { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null, captchaChave: null };
const SESSAO = { token: 'tok', id: ALAN, nome: 'Alan', papel: 'dono', deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda'] };

const GOOGLE_FALSO = "window.grecaptcha={render:(el,o)=>{const b=document.createElement('button');b.type='button';b.textContent='Não sou um robô';b.setAttribute('data-testid','captcha-falso');b.onclick=()=>o.callback('prova-boa');el.appendChild(b)}};setTimeout(()=>window.agendzCaptchaPronto&&window.agendzCaptchaPronto(),0);";

async function novaPagina(nav, vp, modo) {
  const touch = vp.width < 700;
  const ctx = await nav.b.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-28T10:00:00-03:00'));
  await ctx.route('https://www.google.com/recaptcha/api.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: GOOGLE_FALSO }));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => nav.erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { nav.erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  return { ctx, p, aplicarTema: async () => {
    if (vp.width < 700) await p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' });
    await p.evaluate((x) => document.documentElement.setAttribute('data-theme', x === 'claro' ? 'light' : 'dark'), modo);
  } };
}

async function cenarioLoginComChave(vp, modo) {
  const rotulo = `login-com/${vp.width}/${modo}`;
  let tentativas = 0;
  const logins = [];
  const srv = await subirServidor((c, { json }) => {
    if (c.u === '/api/auth/login' && c.m === 'POST') {
      tentativas += 1;
      logins.push(c);
      if (tentativas <= 5) return json(401, { mensagem: 'Usuário ou senha inválidos.' });
      if (!c.corpo?.captcha) return json(428, { mensagem: 'Confirme que você não é um robô para continuar.' });
      if (c.corpo.captcha === 'prova-boa') return json(200, SESSAO);
      return json(428, { mensagem: 'Verificação inválida.' });
    }
    if (c.u === '/api/agendamentos') return json(200, []);
    if (c.u === '/api/profissionais') return json(200, [{ id: ALAN, nome: 'Alan', papel: 'dono', atende: true, podeVender: true }]);
    if (c.u === '/api/servicos') return json(200, []);
    if (c.u === '/api/estabelecimento/regras-atendimento') return json(200, {});
    if (c.u === '/api/estabelecimento/escala') return json(200, { semana: {} });
    if (c.u === '/api/meu-perfil') return json(200, { id: ALAN, nome: 'Alan' });
    if (c.u === '/api/suporte/nao-lidas') return json(200, { naoLidas: 0 });
    return false;
  }, { loja: LOJA_COM, sessao: SESSAO });

  const nav = await abrirNavegador();
  const { p, aplicarTema } = await novaPagina(nav, vp, modo);
  await p.goto(srv.url);
  await aplicarTema();
  const T = (t) => p.getByTestId(t);

  await T('login-id').fill('alan');
  for (let i = 1; i <= 5; i++) {
    await T('login-senha').fill(`errada-${i}`);
    await T('login-entrar').click();
    await T('login-erro').waitFor();
    assert.equal(await T('captcha').count(), 0, `${rotulo}: tentativa ${i} (401) ainda não pede captcha`);
  }

  // 6ª tentativa sem captcha -> 428 e a caixa aparece
  await T('login-senha').fill('errada-6');
  await T('login-entrar').click();
  await T('captcha').waitFor();
  assert.match(await T('login-erro').innerText(), /robô/);
  await T('captcha-falso').waitFor();
  await nav.semRolagem(p, `${rotulo}: login com captcha`);

  // Resolver captcha e entrar -> envia captcha: 'prova-boa'
  await T('captcha-falso').click();
  await T('login-senha').fill('Minha-senha');
  await T('login-entrar').click();
  await T('sair').waitFor();
  assert.equal(logins.at(-1).corpo.captcha, 'prova-boa', `${rotulo}: envia captcha: 'prova-boa'`);
  assert.deepEqual(nav.erros, [], `${rotulo}: sem erro de página`);
  await nav.b.close(); srv.fechar();
  ok(`${rotulo}: 5x 401 -> 6ª 428 mostra caixa -> envia prova-boa`);
}

async function cenarioLoginSemChave(vp, modo) {
  const rotulo = `login-sem/${vp.width}/${modo}`;
  const srv = await subirServidor((c, { json }) => {
    if (c.u === '/api/auth/login' && c.m === 'POST') {
      return json(428, { mensagem: 'Confirme que você não é um robô para continuar.' });
    }
    return false;
  }, { loja: LOJA_SEM, sessao: SESSAO });

  const nav = await abrirNavegador();
  const { p, aplicarTema } = await novaPagina(nav, vp, modo);
  await p.goto(srv.url);
  await aplicarTema();
  const T = (t) => p.getByTestId(t);

  await T('login-id').fill('alan');
  await T('login-senha').fill('senha');
  await T('login-entrar').click();
  await T('login-erro').waitFor();
  assert.match(await T('login-erro').innerText(), /robô/);
  assert.equal(await T('captcha').count(), 0, `${rotulo}: sem captchaChave nunca aparece a caixa`);
  await nav.semRolagem(p, `${rotulo}: login sem chave`);
  assert.deepEqual(nav.erros, [], `${rotulo}: sem erro de página`);
  await nav.b.close(); srv.fechar();
  ok(`${rotulo}: loja sem captchaChave mostra só a mensagem no 428`);
}

async function cenarioLinkCliente(vp, modo) {
  const rotulo = `link-captcha/${vp.width}/${modo}`;
  const pedidos = [];
  const srv = await subirServidor((c, { json }) => {
    if (c.u === '/api/publico/agendar') return json(200, { ativo: true, aviso: null, diasMax: 30, exigeTelefone: true, selo: SELO, servicos: [{ id: CORTE, nome: 'Corte', duracao: 30, preco: 40, antecedenciaH: 0 }], profissionais: [{ id: ALAN, nome: 'Alan', foto: null }] });
    if (c.u === '/api/publico/dias') return json(200, ['2026-10-30']);
    if (c.u === '/api/publico/horarios') return json(200, [{ inicio: '2026-10-30T12:00:00Z', profissionalId: ALAN }]);
    if (c.u === '/api/publico/planos/uso') return json(200, { usaPlano: false });
    if (c.u === '/api/publico/agendamentos' && c.m === 'POST') {
      pedidos.push(c);
      if (c.h['x-captcha'] !== 'prova-boa') return json(428, { mensagem: 'Confirme que você não é um robô para pedir o horário.' });
      const q = Date.parse(c.corpo.inicio);
      return json(201, { agendamento: { id: id(400), inicio: new Date(q).toISOString(), fim: new Date(q + 1800000).toISOString(), status: 'a_confirmar', rotulo: 'Aguardando confirmação', servicos: ['Corte'], duracao: 30, total: 40, desconto: 0, cupom: null, profissional: 'Alan', ativo: true, podeCancelar: true }, token: 'ab'.repeat(24), usouPlano: false });
    }
    return false;
  }, { loja: LOJA_COM, sessao: SESSAO });

  const nav = await abrirNavegador();
  const { p, aplicarTema } = await novaPagina(nav, vp, modo);
  await p.goto(srv.url + '#agendar');
  await aplicarTema();
  const T = (t) => p.getByTestId(t);

  await T(`pub-srv-${CORTE}`).check();
  await T('pub-continuar-1').click();
  await T('pub-dia-2026-10-30').click();
  await T('pub-hora-0900').click();
  await T('pub-continuar-2').click();
  await T('pub-nome').fill('Maria Souza');
  await T('pub-tel').fill('53999000002');
  await T('pub-enviar').click();

  // 1º envio sem X-Captcha -> 428, mostra erro e caixa de captcha
  await T('captcha').waitFor();
  assert.match(await T('pub-erro').innerText(), /robô/);
  await T('captcha-falso').waitFor();
  await nav.semRolagem(p, `${rotulo}: link com captcha`);

  // Resolve o captcha e envia de novo -> 201 com X-Captcha: prova-boa
  await T('captcha-falso').click();
  await T('pub-enviar').click();
  await T('pub-feito').waitFor();
  assert.equal(pedidos.length, 2);
  assert.equal(pedidos[0].h['x-captcha'], undefined);
  assert.equal(pedidos[1].h['x-captcha'], 'prova-boa', `${rotulo}: segundo envio leva X-Captcha`);
  await nav.semRolagem(p, `${rotulo}: pub-feito`);
  assert.deepEqual(nav.erros, [], `${rotulo}: sem erro de página`);
  await nav.b.close(); srv.fechar();
  ok(`${rotulo}: link pede X-Captcha no 428 e conclui com 201`);
}

const VPS = [{ width: 390, height: 844 }, { width: 1280, height: 860 }];
for (const vp of VPS) {
  for (const modo of ['claro', 'escuro']) {
    await cenarioLoginComChave(vp, modo);
    await cenarioLoginSemChave(vp, modo);
    await cenarioLinkCliente(vp, modo);
  }
}
console.log('e2e117 ok');
