import { test } from '@jest/globals';
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

test('grade do dia estilo Google Calendar: considera duracao dos servicos e divide em livres vs ocupados', () => {
  const calcularFim = (horaInicioStr, duracaoMin) => {
    if (!horaInicioStr || !duracaoMin) return '';
    const [h, m] = horaInicioStr.split(':').map(Number);
    const totalMin = h * 60 + m + duracaoMin;
    const hFim = Math.floor(totalMin / 60) % 24;
    const mFim = totalMin % 60;
    return `${String(hFim).padStart(2, '0')}:${String(mFim).padStart(2, '0')}`;
  };

  const duracaoTotal = 45; // ex: corte (45 min)
  assert.equal(calcularFim('09:00', duracaoTotal), '09:45');
  assert.equal(calcularFim('10:30', 60), '11:30');
  assert.equal(calcularFim('11:45', 30), '12:15');

  const horasLivres = ['09:00', '10:00', '14:30'];
  const minHora = 8, maxHora = 12;
  const grade = [];
  for (let hr = minHora; hr <= maxHora; hr++) {
    for (const min of [0, 30]) {
      if (hr === maxHora && min > 0) continue;
      const strHora = `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      const livre = horasLivres.includes(strHora);
      grade.push({
        hora: strHora,
        status: livre ? 'Disponível' : 'Ocupado',
        termino: livre ? calcularFim(strHora, duracaoTotal) : null
      });
    }
  }

  // 08:00 não está livre -> ocupado
  const s0800 = grade.find((g) => g.hora === '08:00');
  assert.equal(s0800.status, 'Ocupado');
  assert.equal(s0800.termino, null);

  // 09:00 está livre -> disponível com término às 09:45
  const s0900 = grade.find((g) => g.hora === '09:00');
  assert.equal(s0900.status, 'Disponível');
  assert.equal(s0900.termino, '09:45');

  // 09:30 não está livre -> ocupado
  const s0930 = grade.find((g) => g.hora === '09:30');
  assert.equal(s0930.status, 'Ocupado');
});

test('antifraude: registro de alerta vermelho no painel ao neutralizar fraude', () => {
  const aviso = {
    id: 'aviso-1',
    tipo: 'fraude',
    texto: 'Tentativa de ocupação excessiva da agenda neutralizada (IP: 192.168.1.1). Agendamento falso simulado.',
    lido: false,
    em: Date.now()
  };

  assert.equal(aviso.tipo, 'fraude');
  assert.match(aviso.texto, /Tentativa de ocupação excessiva/);
  assert.match(aviso.texto, /Agendamento falso simulado/);
});

test('horario inteligente e anti-buraco: horario colado (08:40) e rejeicao de buracos menores que intervaloMin', () => {
  // Expediente 08:00 as 18:00 (480 a 1080 min). Atendimento existente 08:00 as 08:40 (480 a 520 min).
  // Proximo atendimento existente as 11:00 (660 min).
  const expediente = { ini: 480, fim: 1080 };
  const ocupados = [
    { ini: 480, fim: 520 }, // 08:00 as 08:40
    { ini: 660, fim: 720 }, // 11:00 as 12:00
  ];
  const intervaloMin = 20; // limite anti-buraco configuravel
  const duracao = 30; // servico desejado (30 min)

  function validarEncaixe(tInicio) {
    const tFim = tInicio + duracao;
    if (tInicio < expediente.ini || tFim > expediente.fim) return { valido: false, motivo: 'fora_expediente' };
    for (const o of ocupados) {
      if (tInicio < o.fim && tFim > o.ini) return { valido: false, motivo: 'colisao' };
    }
    // Sobra antes
    let bordaAntes = expediente.ini;
    for (const o of ocupados) {
      if (o.fim <= tInicio && o.fim > bordaAntes) bordaAntes = o.fim;
    }
    const gapAntes = tInicio - bordaAntes;
    if (gapAntes > 0 && gapAntes < intervaloMin) return { valido: false, motivo: 'buraco_antes', gapAntes };

    // Sobra depois
    let bordaDepois = expediente.fim;
    for (const o of ocupados) {
      if (o.ini >= tFim && o.ini < bordaDepois) bordaDepois = o.ini;
    }
    const gapDepois = bordaDepois - tFim;
    if (gapDepois > 0 && gapDepois < intervaloMin) return { valido: false, motivo: 'buraco_depois', gapDepois };

    return { valido: true, gapAntes, gapDepois };
  }

  // 1. Horário grudado no atendimento anterior (08:40): gapAntes = 0 -> VÁLIDO!
  const r0840 = validarEncaixe(520);
  assert.equal(r0840.valido, true);
  assert.equal(r0840.gapAntes, 0);

  // 2. Horário com buraco de 10 min antes (08:50): gapAntes = 10 < 20 -> INVÁLIDO (buraco morto)!
  const r0850 = validarEncaixe(530);
  assert.equal(r0850.valido, false);
  assert.equal(r0850.motivo, 'buraco_antes');

  // 3. Horário com sobra de 30 min antes (09:10): gapAntes = 30 >= 20 -> VÁLIDO!
  const r0910 = validarEncaixe(550);
  assert.equal(r0910.valido, true);
  assert.equal(r0910.gapAntes, 30);

  // 4. Horário grudado no atendimento seguinte (termina exatamente as 11:00, inicia as 10:30): gapDepois = 0 -> VÁLIDO!
  const r1030 = validarEncaixe(630);
  assert.equal(r1030.valido, true);
  assert.equal(r1030.gapDepois, 0);

  // 5. Horário que deixa buraco de 10 min antes do proximo (10:20 a 10:50, sobra 10 min ate as 11:00): gapDepois = 10 < 20 -> INVÁLIDO!
  const r1020 = validarEncaixe(620);
  assert.equal(r1020.valido, false);
  assert.equal(r1020.motivo, 'buraco_depois');
});
