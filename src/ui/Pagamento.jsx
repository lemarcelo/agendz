/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:3987861b83 */
import React, { useState } from 'react';
import { financeiro as api, store } from '../services/api.js';
import { ROTULO_VIA, cobrancasDoAgendamento, contaDe, creditavelDoAgendamento, creditoDoCliente, partesACobrar, partesCobranca, pendenciasDeAnalise, prazoCancelamentoPix, situacaoPorConta } from '../domain/financeiro.js';
import { cpfFormatado } from '../domain/pix.js';
import { formatarCpf, pode } from '../domain/rules.js';
import { fmtDateTime, fmtHM, fmtDate, fmtMoney } from '../domain/time.js';
import { Btn, Campo } from './common.jsx';
import { ChipCob, PixBloco } from './Financeiro.jsx';
import { clienteDe } from './format.js';
import { toast } from './hooks.js';

const nomesDe = (st, ids) => ids.map((id) => (st.servicos.find((x) => x.id === id) || {}).nome).filter(Boolean).join(' + ');

// Uma cobrança Pix do atendimento (uma por conta responsável).
function CobrancaPix({ c, st, user, mostraConta }) {
  const ct = contaDe(st, c.contaId);
  const prazo = c.status === 'pendente' ? prazoCancelamentoPix(st, c) : null;
  return (
    <div className="pix-cobranca" data-testid={`cobranca-${c.id}`}>
      {mostraConta && <p className="muted pix-conta">Cai na <b>{ct ? ct.apelido : '—'}</b>{c.servicoIds ? ` · ${nomesDe(st, c.servicoIds)}` : ''}</p>}
      <p className="pix-resumo"><ChipCob c={c} /> <b>{fmtMoney(c.valor)}</b> {c.complementar && <span className="chip chip-p" data-testid="pix-complementar">Complementar</span>} {c.via === 'credito' && <span className="chip chip-p">Crédito</span>} {c.emitidaPor === 'api' && <span className="chip chip-p">API do {c.bancoApi}</span>} {c.cpf && <span className="muted">· CPF {cpfFormatado(c.cpf).replace(/^(\d{3})\.\d{3}\.\d{3}/, '$1.***.***')}</span>}</p>
      {c.status === 'paga' && c.via === 'credito' ? (
        <p className="muted" data-testid="pix-pago-credito">Pago com o crédito do cliente em {fmtDateTime(c.pagaEm)}. Nenhum Pix foi gerado nem enviado.</p>
      ) : c.status === 'paga' ? (
        <p className="muted" data-testid="pix-pago">Pago em {fmtDateTime(c.pagaEm)} · {ROTULO_VIA[c.via]}. {c.avisoPagoEm ? 'O cliente foi avisado no WhatsApp.' : 'O código não tinha sido enviado, então o cliente não recebeu aviso.'}</p>
      ) : (
        <>
          <PixBloco c={c} st={st} podeConfirmar={pode(user, 'financeiro')} />
          <p className="muted">{c.enviadaEm ? `Enviado ao cliente em ${fmtDateTime(c.enviadaEm)}. Quando o pagamento cair, ele é avisado no WhatsApp.` : 'Ainda não enviado. Depois de enviar, o cliente é avisado no WhatsApp quando o pagamento cair.'} Vale até {fmtDateTime(c.expiraEm)}.{prazo && prazo < c.expiraEm ? ` Se não for pago, é cancelado em ${fmtDateTime(prazo)} (configuração dos avisos).` : ''}</p>
        </>
      )}
    </div>
  );
}

// Seção "Pagamento" da ficha do agendamento: gera o Pix copia e cola para o CPF de quem vai pagar, envia pelo WhatsApp e mostra se foi pago.
// Cada serviço vai para a conta do seu grupo de movimentação: se o atendimento envolve mais de uma conta, há um Pix para cada uma.
export function Pagamento({ a, st, user }) {
  const cobs = cobrancasDoAgendamento(st, a);
  const mostradas = st.financeiro.cobrancas.filter((c) => c.agendamentoId === a.id && (c.status === 'pendente' || c.status === 'paga')).reverse(); // cronológica: original, depois a complementar
  const diferencas = a.status === 'cancelado' ? [] : situacaoPorConta(st, a).filter((x) => x.pagas.length && x.falta !== 0 && !(x.falta > 0 && x.pendentes.some((c) => c.valor === x.falta)));
  const partes = partesCobranca(st, a);
  const ativas = cobs.filter((c) => c.status === 'pendente' || c.status === 'paga');
  const faltam = partesACobrar(st, a);
  const cli = clienteDe(st, a);
  const [cpf, setCpf] = useState(cli?.cpf || '');
  const [valor, setValor] = useState('');
  const [erro, setErro] = useState('');
  const mostraConta = st.financeiro.contas.length > 1 && partes.some((p) => p.conta);
  const totalFalta = faltam.reduce((t, p) => t + p.aCobrar, 0);
  const creditaveis = creditavelDoAgendamento(st, a);
  const totalCreditavel = creditaveis.reduce((t, x) => t + x.valor, 0);
  const acertosAgendamento = [
    ...(st.financeiro.creditos || []).filter((x) => x.agendamentoId === a.id).map((x) => ({ rotulo: 'Mantido como crédito do cliente', valor: x.valor })),
    ...(st.financeiro.baixas || []).filter((x) => x.agendamentoId === a.id).map((x) => ({ rotulo: x.tipo === 'despesa' ? 'Devolvido pelo banco (despesa lançada)' : 'Devolvido por fora', valor: x.valor })),
  ];
  const pendentes = pendenciasDeAnalise(st, a.clienteId).filter((p) => p.agendamento.id !== a.id);
  // O crédito vale mesmo com Pix pendente na conta: ao aplicar, o Pix pendente é cancelado.
  const comCreditoPossivel = partesACobrar(st, a, { comPendentes: true });
  const usaveis = comCreditoPossivel.filter((p) => creditoDoCliente(st, a.clienteId, p.conta.id, store.agora()) > 0);
  const totalUsavel = usaveis.reduce((t, p) => t + Math.min(p.aCobrar, creditoDoCliente(st, a.clienteId, p.conta.id, store.agora())), 0);
  const inativas = cobs.filter((c) => c.status === 'expirada' || c.status === 'cancelada');
  if (a.status === 'cancelado' && !cobs.length) return null;

  const gerar = () => {
    const r = api.gerarCobranca(a.id, { cpf, valor });
    if (!r.ok) { setErro(r.erros[0]); return; }
    setErro(''); setValor(''); toast(r.cobrancas.length > 1 ? `${r.cobrancas.length} Pix gerados, um para cada conta.` : 'Pix gerado. Copie o código ou envie pelo WhatsApp.');
  };

  return (
    <section className="bloco" data-testid="bloco-pagamento">
      <h3>Pagamento</h3>
      {mostradas.map((c) => <CobrancaPix key={c.id} c={c} st={st} user={user} mostraConta={mostraConta} />)}
      {diferencas.map((x) => (
        <p key={x.contaId} className="muted" data-testid="pix-diferenca">
          O atendimento{mostraConta && x.conta ? ` (${x.conta.apelido})` : ''} vale <b>{fmtMoney(x.esperado)}</b> e o cliente pagou <b>{fmtMoney(x.liquido)}</b>: {x.falta > 0 ? `faltam ${fmtMoney(x.falta)}` : `${fmtMoney(-x.falta)} a mais`}.
          {a.status === 'concluido' ? ' Como está concluído, nada é cobrado nem avisado ao cliente automaticamente.' : x.falta > 0 ? ' Nada foi enviado ao cliente: gere o Pix da diferença abaixo, se for cobrar.' : ' Escolha abaixo o que fazer com a diferença.'}
        </p>
      ))}
      {pendentes.length > 0 && (
        <div className="aviso aviso-erro" data-testid="pix-pendente-analise">
          <div>
            <b>Agendamento pago pendente de análise:</b>
            {pendentes.map((p) => <span key={p.agendamento.id} style={{ display: 'block' }}>{nomesDe(st, p.agendamento.servicoIds)} de {fmtDate(p.agendamento.inicio)} às {fmtHM(p.agendamento.inicio)} ({p.agendamento.status === 'cancelado' ? 'cancelado' : 'valor reduzido'}): {fmtMoney(p.valor)} a acertar com o cliente. Abra esse agendamento e escolha o que fazer.</span>)}
          </div>
        </div>
      )}
      {creditaveis.length > 0 && (
        <div className="aviso aviso-erro" data-testid="pix-creditar">
          <div>
            {a.status === 'cancelado'
              ? <><b>O cliente já tinha pago {fmtMoney(totalCreditavel)} por Pix.</b> O que fazer com esse valor?</>
              : <><b>{fmtMoney(totalCreditavel)} pagos a mais</b> (o atendimento passou a valer menos). O que fazer com a diferença?</>}
            <ul className="muted" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              <li><b>Manter como crédito:</b> o cliente poderá usar em outro atendimento e é avisado no WhatsApp.</li>
              {pode(user, 'financeiro') && <li><b>Lançar despesa:</b> você devolveu pelo banco; a saída do extrato concilia com a despesa.</li>}
              <li><b>Devolvi por fora:</b> só registra, sem lançamento.</li>
            </ul>
            {pode(user, 'agenda') && (
              <div className="acoes">
                <Btn tamanho="sm" variante="sucesso" icone="check" onClick={() => { if (api.acertarValorPago(a.id, 'credito').ok) toast('Valor mantido como crédito. O cliente foi avisado no WhatsApp.'); }} data-testid="manter-credito">{a.status === 'cancelado' ? (a.motivoCancelamento === 'cliente' ? 'Cancelado pelo cliente: manter como crédito' : 'Não compareceu: manter como crédito') : 'Manter como crédito'}</Btn>
                {pode(user, 'financeiro') && <Btn tamanho="sm" icone="check" onClick={() => { if (api.acertarValorPago(a.id, 'despesa').ok) toast('Despesa lançada. Concilie com a saída do banco.'); }} data-testid="acerto-despesa">Lançar despesa (devolvi pelo banco)</Btn>}
                <Btn tamanho="sm" icone="check" onClick={() => { if (api.acertarValorPago(a.id, 'fora').ok) toast('Registrado: devolvido por fora.'); }} data-testid="acerto-fora">Devolvi por fora</Btn>
              </div>
            )}
          </div>
        </div>
      )}
      {acertosAgendamento.length > 0 && <p className="muted" data-testid="pix-credito-mantido">{acertosAgendamento.map((x) => `${x.rotulo}: ${fmtMoney(x.valor)}`).join(' · ')}.</p>}
      {usaveis.length > 0 && a.status !== 'cancelado' && (
        <div className="acoes" data-testid="bloco-usar-credito">
          <p className="muted">O cliente tem <b>{fmtMoney(totalUsavel)}</b> de crédito{mostraConta ? ' (da mesma conta dos serviços)' : ''}.{cobrancasDoAgendamento(st, a).some((c) => c.status === 'pendente') ? ' Ao pagar com o crédito, o Pix pendente é cancelado.' : ''}</p>
          <Btn tamanho="sm" variante="sucesso" icone="check" onClick={() => { const r = api.usarCredito(a.id); if (r.ok) toast(`Crédito usado: ${fmtMoney(r.total)}.${r.pixCancelados && r.pixCancelados.length ? ' O Pix pendente foi cancelado.' : ''}`); else toast(r.erros[0], 'erro'); }} data-testid="usar-credito">Pagar com o crédito</Btn>
        </div>
      )}
      {faltam.length > 0 && a.status !== 'cancelado' && (
        <>
          {inativas.map((c) => <p key={c.id} className="muted">Última cobrança{mostraConta ? ` (${(contaDe(st, c.contaId) || {}).apelido})` : ''}: {c.status === 'expirada' ? 'expirou' : 'cancelada'} ({fmtMoney(c.valor)}). Gere outra se precisar.</p>)}
          <p className="muted">{faltam.some((p) => p.complementar) ? 'Diferença a cobrar' : ativas.length ? 'Falta cobrar' : 'Total do atendimento'}: <b>{fmtMoney(totalFalta)}</b> (serviços + acréscimos). O código Pix é gerado para o CPF de quem vai pagar e só é enviado ao cliente quando você clicar em enviar.</p>
          {faltam.length > 1 && <p className="muted" data-testid="pix-divisao">Os serviços estão em contas diferentes, então serão gerados {faltam.length} Pix, um para cada conta: {faltam.map((p) => `${p.conta.apelido} (${fmtMoney(p.aCobrar)})`).join(' · ')}.</p>}
          <div className="form-grade">
            <Campo rotulo="CPF de quem vai pagar"><input inputMode="numeric" value={formatarCpf(cpf)} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" data-testid="pix-cpf" /></Campo>
            {faltam.length === 1 && <Campo rotulo="Valor (R$)" dica="Deixe vazio para cobrar o total."><input type="number" min="0" step="0.01" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={String(totalFalta).replace('.', ',')} data-testid="pix-valor" /></Campo>}
          </div>
          {erro && <p className="msg-conflito" role="alert" data-testid="pix-erro">{erro}</p>}
          <div className="acoes"><Btn variante="primario" icone="zap" onClick={gerar} data-testid="pix-gerar">{faltam.length > 1 ? `Gerar ${faltam.length} Pix copia e cola` : faltam[0]?.complementar ? 'Gerar Pix da diferença' : 'Gerar Pix copia e cola'}</Btn></div>
        </>
      )}
    </section>
  );
}
