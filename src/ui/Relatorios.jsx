/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:9825df7626 */
import React, { useState } from 'react';
import { relatorioMensal } from '../domain/reports.js';
import { comissoes } from '../services/api.js';
import { addDays, addMonths, fmtDate, fmtHM, fmtMoney, fmtMonthYear, fromYmd, monthStart, startOfDay, ymd } from '../domain/time.js';
import { Abas, Aviso, Btn, Icon, Vazio } from './common.jsx';
import { nomeCliente } from './format.js';
import { toast, useStore } from './hooks.js';
import Tabela from './Tabela.jsx';
import { rot, Rot, rots } from '../domain/tipos.js';

export function NavMes({ mes, setMes, agora }) {
  return (
    <div className="barra-cal-nav">
      <button type="button" className="icone-btn" onClick={() => setMes(addMonths(mes, -1))} aria-label="Mês anterior"><Icon n="left" /></button>
      <h2 className="cal-titulo" data-testid="rel-mes">{fmtMonthYear(mes)}</h2>
      <button type="button" className="icone-btn" onClick={() => setMes(addMonths(mes, 1))} aria-label="Próximo mês"><Icon n="right" /></button>
      <Btn tamanho="sm" onClick={() => setMes(monthStart(agora))} disabled={mes === monthStart(agora)}>Mês atual</Btn>
    </div>
  );
}

// Período da comissão: começa no mês mostrado; as setas pulam de mês e os campos De/Até aceitam qualquer intervalo (até 366 dias).
export function PeriodoComissao({ per, setPer, agora }) {
  const { de, ate } = per;
  const mudaMes = (n) => { const ini = addMonths(monthStart(de), n); setPer({ de: ini, ate: addMonths(ini, 1) - 1 }); };
  const inteiro = de === monthStart(de) && startOfDay(ate) === startOfDay(addMonths(de, 1) - 1);
  const campo = (k) => (e) => { if (e.target.value) setPer({ ...per, [k]: fromYmd(e.target.value) }); };
  return (
    <div className="barra-cal-nav" style={{ flexWrap: 'wrap' }}>
      <button type="button" className="icone-btn" onClick={() => mudaMes(-1)} aria-label="Mês anterior"><Icon n="left" /></button>
      <h2 className="cal-titulo" data-testid="rel-mes">{inteiro ? fmtMonthYear(de) : `${fmtDate(de)} a ${fmtDate(ate)}`}</h2>
      <button type="button" className="icone-btn" onClick={() => mudaMes(1)} aria-label="Próximo mês"><Icon n="right" /></button>
      <label className="campo-linha">De <input type="date" value={ymd(de)} onChange={campo('de')} data-testid="per-de" /></label>
      <label className="campo-linha">Até <input type="date" value={ymd(ate)} onChange={campo('ate')} data-testid="per-ate" /></label>
      <Btn tamanho="sm" onClick={() => setPer(mesDe(agora))} disabled={inteiro && de === monthStart(agora)}>Mês atual</Btn>
    </div>
  );
}
const mesDe = (ts) => { const ini = monthStart(ts); return { de: ini, ate: addMonths(ini, 1) - 1 }; };
// O período vai para a API como { deTs, ateTs } (dias inclusive); a despesa leva "mês/ano" quando o período é um mês inteiro.
const paraApi = (per) => ({ deTs: per.de, ateTs: per.ate });

const nomeLinha = (st, l) => (l.clienteId ? nomeCliente(st, { clienteId: l.clienteId }) : l.nomeAvulso || 'Atendimento local');

// O que o profissional vê: só o que ele recebe. Sem valor cheio, sem parte do estabelecimento, sem custo de material.
export function RelatorioProfissional() {
  const { state: st, agora } = useStore();
  const [per, setPer] = useState(() => mesDe(agora));
  const r = comissoes.meuMes(paraApi(per));
  if (!r.ok) return <><div className="filtros-rel"><PeriodoComissao per={per} setPer={setPer} agora={agora} /></div><Aviso tipo="erro">{r.erros[0]}</Aviso></>;
  return (
    <section className="tela">
      <header className="tela-topo"><h1>Meus ganhos</h1></header>
      <div className="filtros-rel"><PeriodoComissao per={per} setPer={setPer} agora={agora} /></div>
      <div className="tiles">
        <div className="tile"><small>Atendimentos concluídos</small><b data-testid="meu-qtd">{r.totais.atendimentos}</b></div>
        <div className="tile destaque"><small>A receber no período</small><b data-testid="meu-receber">{fmtMoney(r.totais.receber)}</b></div>
        <div className="tile"><small>Já pago</small><b data-testid="meu-pago">{fmtMoney(r.totais.jaPago)}</b></div>
        <div className="tile"><small>Falta receber</small><b data-testid="meu-falta">{fmtMoney(r.totais.aReceber)}</b></div>
      </div>
      {r.previsto.atendimentos > 0 && <Aviso icone="clock">Ainda previsto neste período: {r.previsto.atendimentos} {r.previsto.atendimentos === 1 ? 'agendamento' : 'agendamentos'}, somando {fmtMoney(r.previsto.receber)} a receber. Só entram quando forem concluídos.</Aviso>}
      <h3>Atendimentos concluídos</h3>
      {r.linhas.length === 0 ? <Vazio icone="list" titulo="Nenhum atendimento concluído neste período" texto="O valor a receber aparece aqui quando o atendimento é concluído." /> : (
        <Tabela id="meu-atendimentos" testid="meu-tabela" chave={(l) => l.id} linhas={r.linhas} colunas={[
          { id: 'data', titulo: 'Data', cel: (l) => <>{fmtDate(l.inicio)}<small className="muted"> {fmtHM(l.inicio)}</small></> },
          { id: 'cliente', titulo: 'Cliente', cel: (l) => nomeLinha(st, l) },
          { id: 'servicos', titulo: 'Serviços', cel: (l) => l.servicos.join(' + ') },
          { id: 'receber', titulo: 'A receber', cls: 'num', cel: (l) => <b>{fmtMoney(l.receber)}</b> },
          { id: 'situacao', titulo: 'Situação', cel: (l) => (l.paga ? <span className="chip chip-ok">Pago</span> : <span className="muted">A receber</span>) },
        ]} rodape={{ rotulo: `Total (${r.totais.atendimentos})`, celulas: { receber: fmtMoney(r.totais.receber) } }} />
      )}
    </section>
  );
}

// O que o proprietário vê: quanto cada profissional ganhou de comissão, o que já foi pago e o que ainda deve.
function Comissoes() {
  const { state: st, agora } = useStore();
  const [per, setPer] = useState(() => mesDe(agora));
  const [abrir, setAbrir] = useState('');
  const [confirma, setConfirma] = useState('');
  const r = comissoes.relatorio(paraApi(per));
  if (!r.ok) return <><div className="filtros-rel"><PeriodoComissao per={per} setPer={setPer} agora={agora} /></div><Aviso tipo="erro">{r.erros[0]}</Aviso></>;
  const pagar = (b) => {
    const x = comissoes.pagar(b.id, paraApi(per));
    setConfirma('');
    if (x.ok) toast(`Comissão de ${fmtMoney(x.valor)} paga a ${b.nome}. Lançada como despesa em Comissões.`); else toast(x.erros[0], 'erro');
  };
  const det = r.profissionais.find((b) => b.id === abrir);
  return (
    <>
      <div className="filtros-rel"><PeriodoComissao per={per} setPer={setPer} agora={agora} /></div>
      <div className="tiles">
        <div className="tile"><small>Comissão total</small><b data-testid="com-total">{fmtMoney(r.totais.comissao)}</b></div>
        <div className="tile destaque"><small>A pagar</small><b data-testid="com-apagar">{fmtMoney(r.totais.aPagar)}</b></div>
        <div className="tile"><small>Já pago</small><b data-testid="com-pago">{fmtMoney(r.totais.pago)}</b></div>
        <div className="tile"><small>Parte do estabelecimento</small><b data-testid="com-casa">{fmtMoney(r.totais.casa)}</b></div>
      </div>
      <p className="muted">Comissão = parte do valor do {rot('atendimento')} que fica com o {rot('profissional')} (valor do serviço − cupom, vezes o percentual). O restante fica com o estabelecimento. O proprietário não recebe comissão do que atende.</p>
      {r.profissionais.length === 0 ? <Vazio icone="list" titulo="Nenhum atendimento concluído neste período" texto="A comissão é calculada quando o atendimento é concluído." /> : (
        <Tabela id="rel-comissoes" testid="com-tabela" minimo={false} chave={(b) => b.id} linhas={r.profissionais} colunas={[
          { id: 'profissional', titulo: Rot('profissional'), cel: (b) => <>{b.nome}{b.semComissao && <small className="muted"> (proprietário)</small>}</> },
          { id: 'atend', titulo: 'Atend.', cls: 'num', cel: (b) => b.atendimentos },
          { id: 'base', titulo: `Valor dos ${rots('atendimento')}`, cls: 'num', cel: (b) => fmtMoney(b.base) },
          { id: 'comissao', titulo: 'Comissão', cls: 'num', cel: (b) => <b>{fmtMoney(b.comissao)}</b> },
          { id: 'casa', titulo: 'Estabelecimento', cls: 'num', cel: (b) => fmtMoney(b.casa) },
          { id: 'pago', titulo: 'Pago', cls: 'num', cel: (b) => fmtMoney(b.pago) },
          { id: 'apagar', titulo: 'A pagar', cls: 'num', cel: (b) => <b data-testid={`com-apagar-${b.id}`}>{fmtMoney(b.aPagar)}</b> },
          { id: 'acao', titulo: '', cel: (b) => (
            <span className="acoes-linha">
              <Btn tamanho="sm" onClick={() => setAbrir(abrir === b.id ? '' : b.id)} data-testid={`com-detalhe-${b.id}`}>{abrir === b.id ? 'Fechar' : 'Detalhes'}</Btn>
              {b.aPagar > 0 && (confirma === b.id
                ? <><Btn tamanho="sm" variante="primario" onClick={() => pagar(b)} data-testid={`com-confirmar-${b.id}`}>Confirmar {fmtMoney(b.aPagar)}</Btn><Btn tamanho="sm" onClick={() => setConfirma('')}>Voltar</Btn></>
                : <Btn tamanho="sm" variante="primario" onClick={() => setConfirma(b.id)} data-testid={`com-pagar-${b.id}`}>Registrar pagamento</Btn>)}
            </span>
          ) },
        ]} />
      )}
      {det && (
        <div className="bloco" data-testid="com-detalhe">
          <h3>{det.nome}: atendimentos do período</h3>
          <Tabela id="rel-comissoes-det" minimo={false} chave={(l) => l.a.id} linhas={det.linhas} colunas={[
            { id: 'data', titulo: 'Data', cel: (l) => <>{fmtDate(l.a.inicio)}<small className="muted"> {fmtHM(l.a.inicio)}</small></> },
            { id: 'cliente', titulo: 'Cliente', cel: (l) => nomeCliente(st, l.a) },
            { id: 'servicos', titulo: 'Serviços', cel: (l) => <div className="itens-rel">{[...l.itens, ...l.produtos.map((p) => ({ ...p, nome: `${p.qtd}× ${p.nome}` }))].map((i) => <span key={i.id}><span>{i.nome} <small className="muted">{i.pct}%</small></span><b className="num">{fmtMoney(i.comissao)}</b></span>)}</div> },
            { id: 'base', titulo: 'Valor', cls: 'num', cel: (l) => fmtMoney(l.base) },
            { id: 'comissao', titulo: 'Comissão', cls: 'num', cel: (l) => <b>{fmtMoney(l.comissao)}</b> },
            { id: 'casa', titulo: 'Estabelecimento', cls: 'num', cel: (l) => fmtMoney(l.casa) },
            { id: 'situacao', titulo: 'Situação', cel: (l) => (l.paga ? <span className="chip chip-ok">Pago</span> : <span className="muted">A pagar</span>) },
          ]} />
        </div>
      )}
    </>
  );
}

export default function Relatorios({ user }) {
  const [aba, setAba] = useState('faturamento');
  if (user.papel === 'profissional') return <RelatorioProfissional />;
  return (
    <>
      <section className="tela" style={{ paddingBottom: 0 }}>
        <Abas valor={aba} onChange={setAba} ordem="relatorios" itens={[['faturamento', 'Faturamento'], ['comissoes', 'Comissões']]} />
      </section>
      {aba === 'comissoes' ? <section className="tela"><header className="tela-topo"><h1>Comissões dos {rots('profissional')}</h1></header><Comissoes /></section> : <Faturamento user={user} />}
    </>
  );
}

function Faturamento({ user }) {
  const { state: st, agora } = useStore();
  const ehProfissional = user.papel === 'profissional';
  const [mes, setMes] = useState(() => monthStart(agora));
  const [profissionalId, setProfissionalId] = useState('');
  const filtro = ehProfissional ? user.id : profissionalId;
  const rel = relatorioMensal(st, { mesTs: mes, profissionalId: filtro });
  const profissionais = st.usuarios.filter((u) => u.atende || st.agendamentos.some((a) => a.profissionalId === u.id));
  const temMat = st.materiais.length > 0;

  const copiar = async () => {
    const linhas = [['Data', 'Cliente', Rot('profissional'), 'Serviços', 'Valor dos serviços', 'Acréscimo', 'Total'].join('\t'),
      ...rel.linhas.map((l) => [fmtDate(l.a.inicio), nomeCliente(st, l.a), l.profissional, l.itens.map((i) => i.nome).join(' + '), l.servicos.toFixed(2).replace('.', ','), l.acrescimos.toFixed(2).replace('.', ','), l.total.toFixed(2).replace('.', ',')].join('\t')),
      ['Total', '', '', '', rel.totais.servicos.toFixed(2).replace('.', ','), rel.totais.acrescimos.toFixed(2).replace('.', ','), rel.totais.total.toFixed(2).replace('.', ',')].join('\t')].join('\n');
    try { await navigator.clipboard.writeText(linhas); toast('Tabela copiada. Cole numa planilha.'); } catch { toast('Não consegui copiar automaticamente.', 'erro'); }
  };

  return (
    <section className="tela">
      <header className="tela-topo"><h1>Relatório mensal</h1><Btn icone="list" onClick={copiar} disabled={!rel.linhas.length}>Copiar tabela</Btn></header>
      <div className="filtros-rel">
        <NavMes mes={mes} setMes={setMes} agora={agora} />
        {!ehProfissional && (
          <label className="campo" style={{ marginLeft: 'auto' }}>
            <span className="campo-rotulo">{Rot('profissional')}</span>
            <select value={profissionalId} onChange={(e) => setProfissionalId(e.target.value)} data-testid="rel-profissional">
              <option value="">Todos os {rots('profissional')}</option>
              {profissionais.map((b) => <option key={b.id} value={b.id}>{b.apelido || b.nome}{b.atende ? '' : ' (desativado)'}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="tiles">
        <div className="tile"><small>Atendimentos concluídos</small><b data-testid="rel-qtd">{rel.totais.atendimentos}</b></div>
        <div className="tile"><small>Serviços</small><b data-testid="rel-servicos">{fmtMoney(rel.totais.servicos)}</b></div>
        {rel.totais.acrescimos > 0 && <div className="tile"><small>Acréscimos (antigos)</small><b data-testid="rel-acrescimos">{fmtMoney(rel.totais.acrescimos)}</b></div>}
        {rel.totais.produtos > 0 && <div className="tile"><small>Produtos vendidos</small><b data-testid="rel-produtos">{fmtMoney(rel.totais.produtos)}</b></div>}
        <div className="tile destaque"><small>Total do mês</small><b data-testid="rel-total">{fmtMoney(rel.totais.total)}</b></div>
        {temMat && <div className="tile"><small>Custo de materiais</small><b>{fmtMoney(rel.custoMateriais)}</b></div>}
        {temMat && <div className="tile"><small>Total menos materiais</small><b>{fmtMoney(rel.resultado)}</b></div>}
      </div>
      {rel.previsto.atendimentos > 0 && <Aviso icone="clock">Ainda previsto neste mês: {rel.previsto.atendimentos} {rel.previsto.atendimentos === 1 ? 'agendamento' : 'agendamentos'} a confirmar ou confirmados, somando {fmtMoney(rel.previsto.total)}. Só entram no total quando forem concluídos.</Aviso>}

      <h3>Atendimentos concluídos</h3>
      {rel.linhas.length === 0 ? <Vazio icone="list" titulo="Nenhum atendimento concluído neste mês" texto="Os valores entram aqui quando o atendimento é concluído." /> : (
        <Tabela id="rel-atendimentos" testid="rel-tabela" chave={(l) => l.a.id} linhas={rel.linhas} colunas={[
          { id: 'data', titulo: 'Data', cel: (l) => <>{fmtDate(l.a.inicio)}<small className="muted"> {fmtHM(l.a.inicio)}</small></> },
          { id: 'cliente', titulo: 'Cliente', cel: (l) => nomeCliente(st, l.a) },
          ...(!filtro ? [{ id: 'profissional', titulo: Rot('profissional'), cel: (l) => l.profissional }] : []),
          { id: 'servicos', titulo: 'Serviços', cel: (l) => <div className="itens-rel">{l.itens.map((i) => <span key={i.id}><span>{i.nome}</span><b className="num">{fmtMoney(i.valor)}</b></span>)}</div> },
          { id: 'desconto', titulo: 'Cupom', cls: 'num', cel: (l) => (l.descontos > 0 ? `− ${fmtMoney(l.descontos)}` : <span className="muted">—</span>) },
          ...(rel.totais.acrescimos > 0 ? [{ id: 'acrescimo', titulo: 'Acréscimo', cls: 'num acr', cel: (l) => (l.acrescimos > 0 ? `+ ${fmtMoney(l.acrescimos)}` : <span className="muted">—</span>) }] : []),
          ...(rel.totais.produtos > 0 ? [{ id: 'produtos', titulo: 'Produtos', cls: 'num', cel: (l) => (l.produtos > 0 ? fmtMoney(l.produtos) : <span className="muted">—</span>) }] : []),
          { id: 'total', titulo: 'Total', cls: 'num', cel: (l) => <b>{fmtMoney(l.total)}</b> },
        ]} rodape={{ rotulo: `Total (${rel.totais.atendimentos})`, celulas: { desconto: `− ${fmtMoney(rel.totais.descontos)}`, acrescimo: `+ ${fmtMoney(rel.totais.acrescimos)}`, produtos: fmtMoney(rel.totais.produtos), total: fmtMoney(rel.totais.total) } }} />
      )}

      {rel.linhas.length > 0 && (
        <div className="duas-col">
          {!filtro && (
            <div>
              <h3>Por {rot('profissional')}</h3>
              <Tabela id="rel-profissional" minimo={false} chave={(b) => b.id} linhas={rel.porProfissional} colunas={[
                { id: 'profissional', titulo: Rot('profissional'), cel: (b) => b.nome },
                { id: 'atend', titulo: 'Atend.', cls: 'num', cel: (b) => b.atendimentos },
                { id: 'servicos', titulo: 'Serviços', cls: 'num', cel: (b) => fmtMoney(b.servicos) },
                ...(rel.totais.acrescimos > 0 ? [{ id: 'acrescimos', titulo: 'Acréscimos', cls: 'num acr', cel: (b) => fmtMoney(b.acrescimos) }] : []),
                { id: 'total', titulo: 'Total', cls: 'num', cel: (b) => <b>{fmtMoney(b.total)}</b> },
              ]} />
            </div>
          )}
          <div>
            <h3>Por serviço</h3>
            <Tabela id="rel-servico" minimo={false} chave={(s) => s.id} linhas={rel.porServico} colunas={[
              { id: 'servico', titulo: 'Serviço', cel: (s) => s.nome },
              { id: 'qtd', titulo: 'Qtd.', cls: 'num', cel: (s) => s.qtd },
              { id: 'valor', titulo: 'Valor', cls: 'num', cel: (s) => fmtMoney(s.valor) },
              ...(rel.totais.acrescimos > 0 ? [{ id: 'acrescimos', titulo: 'Acréscimos', cls: 'num acr', cel: (s) => fmtMoney(s.acrescimos) }] : []),
            ]} />
          </div>
          {rel.porProduto.length > 0 && (
            <div>
              <h3>Produtos vendidos</h3>
              <Tabela id="rel-produto" minimo={false} chave={(p) => p.id} linhas={rel.porProduto} colunas={[
                { id: 'produto', titulo: 'Produto', cel: (p) => p.nome },
                { id: 'qtd', titulo: 'Qtd.', cls: 'num', cel: (p) => p.qtd },
                { id: 'valor', titulo: 'Valor', cls: 'num', cel: (p) => fmtMoney(p.valor) },
              ]} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
