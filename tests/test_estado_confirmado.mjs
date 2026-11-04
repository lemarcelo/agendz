import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const artifactsDir = 'C:\\Users\\lemar\\.gemini\\antigravity\\brain\\d0629c7d-43d4-425e-9390-8f6622d78d33';
const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');

const U = (s) => new Date(`${s}-03:00`).toISOString();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ALAN = id(1), BRUNO = id(11);

const agendamentoConfirmado = {
  id: id(102),
  clienteId: BRUNO,
  profissionalId: ALAN,
  inicio: U('2026-10-28T16:00:00'),
  fim: U('2026-10-28T16:40:00'),
  fimOcupado: U('2026-10-28T16:50:00'),
  status: 'confirmado',
  encaixe: false,
  total: 40,
  desconto: 0,
  totalProdutos: 0,
  origem: 'painel',
  servicos: [{ servicoId: id(50), nome: 'Corte Degradê', preco: 40, duracaoMin: 40 }],
  produtos: [],
  conflitosPendentes: [],
  reagendado: false,
  statusManual: false,
  historico: []
};

const servidor = http.createServer((req, res) => {
  const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
  if (u.pathname === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Barbearia Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
  if (u.pathname === '/api/auth/login') return json(200, { token: 'tok', id: ALAN, nome: 'Alan', papel: 'dono', deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes', 'suporte'] });
  if (u.pathname === '/api/clientes') return json(200, [{ id: BRUNO, nome: 'Marcelo Santos', apelido: 'Marcelo Santos', telefone: '11999990001' }]);
  if (u.pathname === '/api/estabelecimento/local') return json(200, { enderecoNoLink: false, localizacaoNoWhatsapp: false, enderecoTexto: 'Rua Central, 50' });
  if (u.pathname === '/api/profissionais') return json(200, [{ id: ALAN, nome: 'Alan', papel: 'dono', atende: true }]);
  if (u.pathname === '/api/boxes') return json(200, []);
  if (u.pathname === '/api/usuarios/me/menu') return json(200, { recolhido: false });
  if (u.pathname === '/api/agendamentos/existem-futuros') return json(200, { existem: false });
  if (u.pathname === `/api/agendamentos/${id(102)}`) return json(200, agendamentoConfirmado);
  if (u.pathname === '/api/agendamentos' && req.method === 'GET') return json(200, [agendamentoConfirmado]);
  json(200, {});
});

await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
const porta = servidor.address().port;

const browser = await chromium.launch({ headless: true });

const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
await ctx.clock.setFixedTime(new Date('2026-10-28T10:00:00-03:00'));

const p = await ctx.newPage();
await p.goto(`http://127.0.0.1:${porta}/`);

await p.getByTestId('login-id').fill('alan');
await p.getByTestId('login-senha').fill('123456');
await p.getByTestId('login-entrar').click();

await p.getByTestId('nav-agenda').waitFor({ state: 'attached' });
await p.getByTestId('nav-agenda').click();
await p.getByTestId('agenda-dia').waitFor();

await p.getByTestId('cartao-abrir').first().click();
await p.getByTestId('detalhe-modal').waitFor();

await p.screenshot({ path: join(artifactsDir, 'modal-estado-confirmado-1366.png') });

await browser.close();
servidor.close();
