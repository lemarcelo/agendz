/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Ausência do profissional (bloco A3) no site real: liga a janela compartilhada (`leve/AusenciaForm.jsx`) à API do servidor. O servidor decide tudo
// (permissão, conflito com agendamento, expediente); aqui só se carrega o expediente, a agenda e as ausências da pessoa para desenhar a grade.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import React from 'react';
import { agenda as apiAgenda, ausencias as apiAus, escalaDoProfissional, expediente } from '../../services/api-real.js';
import { camposDaSemana } from '../../domain/expediente.js';
import { ATIVOS } from '../../domain/rules.js';
import AusenciaForm from '../leve/AusenciaForm.jsx';

async function carregar(profId, de, ate) {
  const [l, p, a, x] = await Promise.all([expediente.obter(), escalaDoProfissional.obter(profId), apiAgenda.listar({ de, ate }), apiAus.listar(de, ate)]);
  return {
    loja: l.ok ? camposDaSemana(l.escala).dias : {},
    pessoa: p.ok ? camposDaSemana(p.escala).dias : {},
    agenda: a.ok ? a.agendamentos.filter((g) => g.profissionalId === profId && ATIVOS.includes(g.status)).map((g) => ({ inicio: g.inicio, fim: g.fim, fimOcupado: g.fimOcupado })) : [],
    existentes: x.ok ? x.ausencias.filter((e) => e.profissionalId === profId).map((e) => ({ ini: e.ini, fim: e.fim })) : [],
  };
}

export default function Ausencia(props) {
  return <AusenciaForm {...props} carregar={carregar} criar={(profId, intervalos) => apiAus.criar(profId, intervalos)} />;
}
