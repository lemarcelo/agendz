/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Comissões do proprietário no site real (5d-4b): quanto cada pessoa ganhou, o que já foi pago e o que falta, registrar pagamento (com confirmação na tela),
// cancelar e restaurar a comissão de um atendimento (motivo obrigatório). Toda a conta e as regras estão no servidor (ComissaoService); esta tela só mostra
// o que ele devolve e as mensagens dele. O pagamento leva chave de repetição (clicar de novo depois de um erro de rede nunca paga duas vezes).
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import React, { useEffect, useRef, useState } from 'react';
import { comissoes as api } from '../../services/api-real.js';
import { fmtDate, fmtHM, fmtMoney } from '../../domain/time.js';
import { mesDe } from '../../domain/periodo-comissao.js';
import { Aviso, Btn, Campo } from '../leve/mini.jsx';
import Periodo from './Periodo.jsx';

const completo = (p) => !!(p.mes || (p.de && p.ate));

export default function Comissoes() {
  const [per, setPer] = useState(() => ({ mes: mesDe(Date.now()) }));
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [versao, setVersao] = useState(0);
  const [aberto, setAberto] = useState('');
  const [confirma, setConfirma] = useState('');
  const [cancelando, setCancelando] = useState(null); // { ag, quem }
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const ultima = useRef(0);

  useEffect(() => {
    if (!completo(per)) { setDados(null); return undefined; }
    const n = ++ultima.current;
    (async () => {
      const r = await api.relatorio(per);
      if (n !== ultima.current) return; // chegou resposta de uma consulta antiga
      if (!r.ok) { setErro(r.erro); setDados(null); return; }
      setErro(''); setDados(r);
    })();
    return () => { ultima.current += 1; };
  }, [per, versao]);

  const executar = async (acao, ok) => {
    if (ocupado) return;
    setOcupado(true); setErro(''); setAviso('');
    const r = await acao();
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    setAviso(typeof ok === 'function' ? ok(r) : ok);
    setConfirma(''); setCancelando(null); setMotivo('');
    setVersao((v) => v + 1);
  };
  const pagar = (p) => executar(() => api.pagar(p.id, per), (r) => `Comissão de ${fmtMoney(r.valor)} paga a ${p.nome}.`);
  const cancelar = () => executar(() => api.cancelar(cancelando.ag, { quem: cancelando.quem, motivo }), 'Comissão cancelada.');
  const restaurar = (ag, quem) => executar(() => api.restaurar(ag, { quem }), 'Comissão restaurada.');

  const det = dados && dados.profissionais.find((p) => p.id === aberto);
  return (
    <section className="tela comissoes-real" data-testid="comissoes">
      <header className="tela-topo"><h1>Comissões</h1></header>
      <Periodo valor={per} aoMudar={(p) => { setPer(p); setAberto(''); setConfirma(''); setCancelando(null); setAviso(''); }} />
      {aviso && <Aviso data-testid="comissoes-aviso">{aviso}</Aviso>}
      {erro && <Aviso tipo="erro" data-testid="comissoes-erro">{erro}</Aviso>}
      {dados && (
        <>
          <div className="tiles">
            <div className="tile"><small>Comissão total</small><b data-testid="com-total">{fmtMoney(dados.totais.comissao)}</b></div>
            <div className="tile destaque"><small>A pagar</small><b data-testid="com-apagar">{fmtMoney(dados.totais.aPagar)}</b></div>
            <div className="tile"><small>Já pago</small><b data-testid="com-pago">{fmtMoney(dados.totais.pago)}</b></div>
            <div className="tile"><small>Parte do estabelecimento</small><b data-testid="com-casa">{fmtMoney(dados.totais.casa)}</b></div>
          </div>
          <p className="muted">Comissão = parte do valor que fica com a pessoa (serviço ou produto vendido, vezes o percentual congelado no atendimento). O restante é do estabelecimento. O proprietário não recebe comissão.</p>
          {dados.profissionais.length === 0 && <p className="muted" data-testid="com-vazio">Nenhum atendimento concluído neste período. A comissão é calculada quando o atendimento é concluído.</p>}
          <ul className="lista-itens" data-testid="com-lista">
            {dados.profissionais.map((p) => (
              <li key={p.id} className="conj" data-testid={`com-pessoa-${p.id}`}>
                <div className="lista-itens-cab">
                  <strong>{p.nome}{p.semComissao && <small className="muted"> (proprietário)</small>}</strong>
                  <span className="muted">{p.atendimentos} {p.atendimentos === 1 ? 'atendimento' : 'atendimentos'}</span>
                </div>
                <p className="muted">Valor {fmtMoney(p.base)} · Comissão <b>{fmtMoney(p.comissao)}</b> · Estabelecimento {fmtMoney(p.casa)} · Pago {fmtMoney(p.pago)} · A pagar <b data-testid={`com-apagar-${p.id}`}>{fmtMoney(p.aPagar)}</b></p>
                <div className="acoes">
                  <Btn tamanho="sm" onClick={() => { setAberto(aberto === p.id ? '' : p.id); setCancelando(null); }} data-testid={`com-detalhe-${p.id}`}>{aberto === p.id ? 'Fechar' : 'Detalhes'}</Btn>
                  {p.aPagar > 0 && (confirma === p.id
                    ? <><Btn tamanho="sm" variante="primario" disabled={ocupado} onClick={() => pagar(p)} data-testid={`com-confirmar-${p.id}`}>Confirmar {fmtMoney(p.aPagar)}</Btn><Btn tamanho="sm" onClick={() => setConfirma('')} data-testid={`com-voltar-${p.id}`}>Voltar</Btn></>
                    : <Btn tamanho="sm" variante="primario" onClick={() => setConfirma(p.id)} data-testid={`com-pagar-${p.id}`}>Registrar pagamento</Btn>)}
                </div>
                {det && det.id === p.id && (
                  <ul className="lista-itens" data-testid="com-linhas">
                    {det.linhas.map((l) => (
                      <li key={l.agendamentoId} className="conj" data-testid={`com-linha-${l.agendamentoId}`}>
                        <div className="lista-itens-cab">
                          <span>{fmtDate(l.inicio)} {fmtHM(l.inicio)} · {l.servicos.join(' + ')}</span>
                          <b>{fmtMoney(l.comissao)}</b>
                        </div>
                        <p className="muted">Valor {fmtMoney(l.base)} · Estabelecimento {fmtMoney(l.casa)}{l.paga ? ' · Paga' : ''}{l.cancelada ? ` · Cancelada (${l.motivoCancelada}; era ${fmtMoney(l.comissaoOriginal ?? 0)})` : ''}</p>
                        {!p.semComissao && !l.paga && !l.cancelada && cancelando?.ag !== l.agendamentoId && <Btn tamanho="sm" onClick={() => { setCancelando({ ag: l.agendamentoId, quem: p.id }); setMotivo(''); }} data-testid={`com-cancelar-${l.agendamentoId}`}>Cancelar comissão</Btn>}
                        {l.cancelada && <Btn tamanho="sm" disabled={ocupado} onClick={() => restaurar(l.agendamentoId, p.id)} data-testid={`com-restaurar-${l.agendamentoId}`}>Restaurar comissão</Btn>}
                        {cancelando && cancelando.ag === l.agendamentoId && (
                          <div className="confirmar-linha" data-testid="com-cancelar-form">
                            <Campo rotulo="Motivo (aparece no histórico)"><input value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} data-testid="com-motivo" /></Campo>
                            <Btn tamanho="sm" variante="perigo" disabled={ocupado} onClick={cancelar} data-testid="com-cancelar-sim">Cancelar comissão</Btn>
                            <Btn tamanho="sm" onClick={() => setCancelando(null)} data-testid="com-cancelar-nao">Voltar</Btn>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {!dados && !erro && completo(per) && <p className="muted" role="status">Carregando…</p>}
      {!completo(per) && <p className="muted">Escolha as duas datas para ver as comissões.</p>}
    </section>
  );
}
