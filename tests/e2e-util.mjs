// © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000
// Passos repetidos dos testes de navegador (fluxo do WhatsApp com veículo e categoria).
export const chips = (p) => p.locator('[data-testid=wa-chips]');
const envia = async (p, texto) => { await p.locator('[data-testid=wa-input]').fill(texto); await p.locator('[data-testid=wa-input]').press('Enter'); };

// Cliente sem veículo cadastrado: placa, modelo e porte (rótulo do botão: Pequeno, Médio, Grande, SUV, Pickup).
export async function waVeiculoNovo(p, { placa = 'QWE1R23', modelo = 'Onix', porte = 'Médio' } = {}) {
  await p.getByText(/qual é a placa/i).last().waitFor();
  await envia(p, placa);
  await p.getByText(/qual é o modelo/i).last().waitFor();
  await envia(p, modelo);
  await chips(p).getByRole('button', { name: new RegExp(porte + ' \\(') }).click();
}

// Escolhe um serviço (passando pela categoria, quando o app mostra categorias) e continua.
export async function waServico(p, nome, categoria, { continuar = true } = {}) {
  if (categoria) await chips(p).getByRole('button', { name: new RegExp('(^|\\s)' + categoria + '$') }).click();
  await chips(p).getByRole('button', { name: nome }).first().click();
  if (continuar) await chips(p).getByRole('button', { name: 'Continuar' }).click();
}

// Cliente que já tem veículo: o app pergunta "Para qual veículo?"; escolhe o primeiro da lista (ou o que casar com `nome`).
export async function waVeiculoExistente(p, nome) {
  await p.getByText(/para qual veículo/i).last().waitFor();
  const alvo = nome ? chips(p).getByRole('button', { name: nome }) : chips(p).getByRole('button').first();
  await alvo.first().click();
}

// Botão Atender do painel: se o formulário pede um veículo novo (cliente sem veículo ou número novo), preenche e salva.
let contaPlaca = 0;
export async function salvarAtender(p, { porte = 'medio', modelo = 'Onix' } = {}) {
  const placa = p.locator('[data-testid="atender-placa"]');
  if (await placa.count()) {
    const n = ++contaPlaca;
    await placa.fill(`TST${n % 10}${String.fromCharCode(65 + (n % 26))}${String(10 + (n % 90))}`);
    await p.locator('[data-testid="atender-modelo"]').fill(modelo);
    await p.locator('[data-testid="atender-porte"]').selectOption(porte);
  }
  await p.locator('[data-testid="salvar-atender"]').click();
}

// Link do cliente, etapa 1: veículo (placa, modelo e porte). `T` busca por data-testid.
export async function pubVeiculo(p, { placa = 'PUB1A23', modelo = 'Onix', porte = 'medio', toque = false } = {}) {
  const T = (id) => p.locator(`[data-testid="${id}"]`);
  await T('pub-placa').fill(placa);
  await T('pub-modelo').fill(modelo);
  await (toque ? T(`pub-porte-${porte}`).tap() : T(`pub-porte-${porte}`).click());
  await (toque ? T('pub-continuar-0').tap() : T('pub-continuar-0').click());
}

// v119: o proprietário (Davi, Apex) libera a seção Suporte no cadastro de cada pessoa; volta à tela de entrada. Só no Artifact (demonstração).
export async function liberarSuporte(p, T, nomes) {
  await T('demo-davi').click(); await T('agenda-topo').waitFor();
  await T('nav-equipe').click();
  for (const nome of nomes) {
    await p.getByRole('button', { name: new RegExp(`Editar ${nome}`) }).first().click();
    await T('acesso-suporte').check(); await T('salvar-usuario').click(); await p.waitForTimeout(250);
  }
  await T('sair').click(); await T('login-id').waitFor();
}
