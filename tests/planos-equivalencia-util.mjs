/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Avalia um caso de equivalencia/planos.json com o domínio JS (src/domain/planos.js). O servidor roda os MESMOS casos em PlanosEquivalenciaTest (PlanoRegras).
import { consomeCorte, dividaAoEncerrar, descontosDoPlano, extrato, podeUsar, rotuloMes, saldoAtual, somaMeses } from '../src/domain/planos.js';

// Hora local sem fuso ('2026-10-15T10:00'): o Node lê no fuso da máquina e o Java no fuso da loja; os casos ficam longe da virada do mês.
export const ts = (iso) => new Date(iso).getTime();

export function avaliar(c) {
  const foto = { ...c.plano, servicoIds: ['sv1'] };
  const as = { id: 'as1', clienteId: 'c1', status: c.status, inicioMes: c.inicioMes, plano: foto, pagamentos: c.pagos.map((mes, i) => ({ id: `mp${i}`, mes, estornado: false })) };
  const s = { agendamentos: c.usos.map((u, i) => ({ id: `a${i}`, inicio: ts(u.inicio), status: u.status, motivoCancelamento: u.motivoCancelamento ?? null, origem: u.origem ?? 'painel', planoUso: { assinaturaId: 'as1' } })) };
  const agora = ts(c.agora);
  const ex = extrato(s, as, agora);
  const sd = saldoAtual(s, as, agora);
  const saida = {
    saldo: { restantes: sd.restantes, usadosNoMes: sd.usadosNoMes, maisPermitidos: sd.maisPermitidos, pagoMes: sd.pagoMes, pagoAte: sd.pagoAte, atrasado: sd.atrasado },
    extrato: ex.linhas.map((l) => ({ mes: l.mes, pago: l.pago, concedidos: l.concedidos, usados: l.usados, saldoFim: l.saldoFim, limite: l.limite, estourou: l.estourou, zerou: l.zerou })),
    divida: dividaAoEncerrar(s, as, agora),
  };
  if (c.extra) {
    const p = podeUsar(s, as, { inicio: ts(c.extra), agora });
    saida.pode = p.ok ? { ok: true, adiantado: p.adiantado, aviso: p.aviso } : { ok: false, erro: p.erro };
  }
  return saida;
}

export const consome = (x) => consomeCorte({ status: x.status, motivoCancelamento: x.motivoCancelamento ?? null, origem: x.origem ?? 'painel' });
export const meses = (x) => ({ soma: somaMeses(x.mes, x.n), rotulo: rotuloMes(x.mes) });
export const descontos = (x) => descontosDoPlano({ incluidos: x.incluidos }, x.itens);
