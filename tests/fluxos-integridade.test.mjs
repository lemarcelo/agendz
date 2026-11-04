/* © 2026 Marcelo — Agendz. Todos os direitos reservados. ref:0000000000 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { store } from '../src/services/api.js';
import { agendarPorLink } from '../src/domain/publico.js';
import { ordemAtenderValida, sanearOrdemAtender, PADRAO_PAINEL } from '../src/domain/ordem-atender.js';

test('anti-leak de erro em wizards: componentes multi-etapa limpam erro na troca de etapa', () => {
  const arquivos = [
    'src/ui/real/AgendarPublico.jsx',
    'src/ui/AgendarPublico.jsx',
    'src/ui/real/Atender.jsx',
    'src/ui/Atender.jsx',
  ];

  for (const arq of arquivos) {
    const conteudo = fs.readFileSync(arq, 'utf8');
    const temEtapa = /\[\s*(etapa|etapaAtiva)\s*,\s*set(Etapa|EtapaAtiva)\s*\]/.test(conteudo);
    assert.ok(temEtapa, `${arq} deve ter controle de etapa`);

    const limpaErroEmHook = /useEffect\(\s*\(\)\s*=>\s*\{\s*setErro\(''\);\s*\}\s*,\s*\[\s*(etapa|etapaAtiva)\s*\]\s*\)/.test(conteudo);
    assert.ok(limpaErroEmHook, `${arq} deve limpar erro via useEffect na troca de etapa`);
  }
});

test('validação progressiva cronológica no link público: erro de horário precede erro de nome', () => {
  store.reiniciar();
  const s = structuredClone(store.getState());
  const agora = Date.parse('2026-10-12T10:00:00-03:00');

  // Payload com serviço e veículo, mas SEM horário e com nome inválido
  const rSemHorario = agendarPorLink(s, {
    profissionalId: 'u-pablo',
    servicoIds: ['s-lav-simples'],
    porte: 'medio',
    placa: 'ABC1D23',
    modelo: 'Civic',
    inicio: null, // não escolheu horário
    nome: '', // também não informou nome
    telefone: '',
  }, agora);

  assert.equal(rSemHorario.ok, false);
  // DEVE acusar o horário primeiro, NUNCA o nome
  assert.equal(rSemHorario.erros[0], 'Escolha um dia e um horário.');

  // Payload com horário válido, mas SEM nome
  const rSemNome = agendarPorLink(s, {
    profissionalId: 'u-pablo',
    servicoIds: ['s-lav-simples'],
    porte: 'medio',
    placa: 'ABC1D23',
    modelo: 'Civic',
    inicio: agora + 3600000,
    nome: '', // sem nome
    telefone: '(51) 99999-9999',
  }, agora);

  assert.equal(rSemNome.ok, false);
  assert.equal(rSemNome.erros[0], 'Informe o seu nome.');
});

test('invariância de domínio: serviço sempre precede horário na ordem do atendimento', () => {
  assert.equal(ordemAtenderValida(PADRAO_PAINEL), true);

  const corrompido = {
    futuro: { etapas: ['cliente', 'quando', 'servicos', 'produtos'], veiculo: [], cliente: [] },
    local: { etapas: ['cliente', 'quando', 'servicos', 'produtos'], veiculo: [], cliente: [] },
  };

  assert.equal(ordemAtenderValida(corrompido), false, 'serviço após horário deve ser recusado');

  const saneado = sanearOrdemAtender(corrompido, PADRAO_PAINEL);
  const idxSrv = saneado.futuro.etapas.indexOf('servicos');
  const idxQdo = saneado.futuro.etapas.indexOf('quando');
  assert.ok(idxSrv < idxQdo, 'saneamento deve reposicionar serviços antes de quando');
});
