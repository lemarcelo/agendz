import test from 'node:test';
import assert from 'node:assert/strict';
import { rotulo } from '../src/domain/tipos.js';

test('perfil estetica_automotiva: rotulo do profissional deve ser esteticista automotivo', () => {
  const loja = { tipo: 'estetica_automotiva' };
  assert.equal(rotulo(loja, 'profissional'), 'esteticista automotivo');
  assert.equal(rotulo(loja, 'profissional', { capitalizado: true }), 'Esteticista automotivo');
  assert.equal(rotulo(loja, 'profissional', { plural: true }), 'esteticistas automotivos');
  assert.equal(rotulo(loja, 'profissional', { plural: true, capitalizado: true }), 'Esteticistas automotivos');
});

test('auto-agendamento time picker: selecao exata e sugestao de horario mais proximo', () => {
  // Simulação da lista de horários livres retornados pelo backend para o dia
  const horas = [
    { inicio: '2026-11-04T12:00:00Z', hora: '09:00' },
    { inicio: '2026-11-04T12:30:00Z', hora: '09:30' },
    { inicio: '2026-11-04T13:00:00Z', hora: '10:00' },
    { inicio: '2026-11-04T17:00:00Z', hora: '14:00' },
    { inicio: '2026-11-04T17:30:00Z', hora: '14:30' },
  ];

  function verificarHorario(txt, listaHoras) {
    if (!listaHoras || listaHoras.length === 0) {
      return { ok: false, motivo: 'vazio', mensagem: 'Não há horários disponíveis neste dia que abranjam os serviços selecionados.' };
    }
    const exato = listaHoras.find((h) => h.hora === txt);
    if (exato) {
      return { ok: true, horario: exato };
    }
    const [hD, mD] = txt.split(':').map(Number);
    const minD = hD * 60 + mD;
    let maisProximo = null;
    let menorDiff = Infinity;
    for (const h of listaHoras) {
      const [hH, hM] = h.hora.split(':').map(Number);
      const minH = hH * 60 + hM;
      const diff = Math.abs(minH - minD);
      if (diff < menorDiff) {
        menorDiff = diff;
        maisProximo = h;
      }
    }
    return {
      ok: false,
      motivo: 'ocupado',
      horarioSugerido: maisProximo,
      mensagem: `O horário ${txt} não está disponível. O mais próximo neste dia é ${maisProximo.hora}.`
    };
  }

  // 1. Horário livre exato
  const r1 = verificarHorario('09:30', horas);
  assert.equal(r1.ok, true);
  assert.equal(r1.horario.hora, '09:30');

  // 2. Horário ocupado / intermediário (ex.: 09:40) sugere o mais próximo (09:30 ou 10:00)
  const r2 = verificarHorario('09:40', horas);
  assert.equal(r2.ok, false);
  assert.equal(r2.motivo, 'ocupado');
  assert.equal(r2.horarioSugerido.hora, '09:30'); // 10 min de 09:30 vs 20 min de 10:00
  assert.match(r2.mensagem, /O horário 09:40 não está disponível\. O mais próximo neste dia é 09:30\./);

  const r3 = verificarHorario('13:45', horas);
  assert.equal(r3.ok, false);
  assert.equal(r3.motivo, 'ocupado');
  assert.equal(r3.horarioSugerido.hora, '14:00'); // 15 min de 14:00 vs 225 min de 10:00

  // 3. Dia sem horários livres com abrangência suficiente
  const r4 = verificarHorario('10:00', []);
  assert.equal(r4.ok, false);
  assert.equal(r4.motivo, 'vazio');
  assert.match(r4.mensagem, /Não há horários disponíveis neste dia que abranjam os serviços selecionados\./);
});
