/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:a5f0925855 */
import React, { useState } from 'react';
import { financeiro as api } from '../services/api.js';
import { BANCOS, CATEGORIAS_CREDITO, CATEGORIAS_DESPESA, ESCOPOS_PIX, bancoApi, contaDe, resumoFinanceiro, usoDoGrupo, creditoExpirado, venceEm, extratosConciliaveis, lancamentosConciliaveis, sugestoesConciliacao } from '../domain/financeiro.js';
import { ERRO_SEM_PIX, usaIntegracaoPix } from '../domain/rules.js';
import { cpfMascarado } from '../domain/pix.js';
import { fmtDate, fmtDateTime, fmtMoney, fromYmd, monthStart, ymd } from '../domain/time.js';
import { Abas, Aviso, Btn, Campo, Icon, Modal, Vazio } from './common.jsx';
import { NavMes } from './Relatorios.jsx';
import { copiarTexto } from './clipboard.js';
import { nomeCliente } from './format.js';
import { toast, useStore } from './hooks.js';
import { SeletorGrupo } from './Grupo.jsx';
import Tabela from './Tabela.jsx';
import { rot } from '../domain/tipos.js';

const ROT_COB = { pendente: 'Aguardando pagamento', paga: 'Paga', expirada: 'Expirada', cancelada: 'Cancelada' };
const ROT_EXT = { conciliado: 'Conciliado', divergente: 'Precisa de autorização', a_classificar: 'A classificar', ignorado: 'Ignorado' };
export const ChipCob = ({ c }) => <span className={`chip chip-p chip-cob-${c.status}`}>{ROT_COB[c.status]}</span>;
const money = (n) => (n < 0 ? `− ${fmtMoney(-n)}` : fmtMoney(n));

// ---------- lançamento (despesa ou crédito) ----------
function FormLancamento({ l, onClose }) {
  const { agora, state: st } = useStore();
  const [f, setF] = useState(l.id ? { ...l, data: ymd(l.data) } : { tipo: l.tipo || 'despesa', descricao: '', valor: '', data: ymd(agora), categoria: '', grupoId: st.estabelecimento.grupoMovimentacaoId });
  const [erro, setErro] = useState('');
  const travado = !!l.id && (l.origem !== 'manual' || l.conciliado);
  const cats = f.tipo === 'despesa' ? CATEGORIAS_DESPESA : CATEGORIAS_CREDITO;
  const salvar = () => {
    const r = api.salvarLancamento({ ...f, data: fromYmd(f.data) });
    if (!r.ok) { setErro(r.erros[0]); return; }
    toast(r.lancamento.conciliado ? 'Lançamento salvo e conciliado com o banco.' : 'Lançamento salvo.'); onClose();
  };
  return (
    <Modal titulo={l.id ? 'Editar lançamento' : f.tipo === 'despesa' ? 'Nova despesa' : 'Novo crédito'} onClose={onClose} largura={500}
      rodape={<>{l.id && l.origem === 'manual' && !l.conciliado && <Btn variante="perigo" icone="trash" onClick={() => { const r = api.removerLancamento(l.id); if (r.ok) { toast('Lançamento removido.'); onClose(); } else setErro(r.erros[0]); }}>Remover</Btn>}<span className="espaco" /><Btn onClick={onClose}>Cancelar</Btn><Btn variante="primario" onClick={salvar} data-testid="salvar-lancamento">Salvar</Btn></>}>
      {!l.id && (
        <div className="seg" role="radiogroup" aria-label="Tipo">
          {[['despesa', 'Despesa'], ['credito', 'Crédito']].map(([k, r]) => <button key={k} type="button" role="radio" aria-checked={f.tipo === k} className={f.tipo === k ? 'on' : ''} onClick={() => setF({ ...f, tipo: k, categoria: '' })} data-testid={`tipo-${k}`}>{r}</button>)}
        </div>
      )}
      <div className="form-grade">
        <Campo rotulo="Descrição" className="campo-largo"><input value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder={f.tipo === 'despesa' ? 'Ex.: Conta de internet' : 'Ex.: Venda de produto'} data-testid="lanc-descricao" /></Campo>
        <Campo rotulo="Valor (R$)"><input type="number" min="0" step="0.01" inputMode="decimal" value={f.valor} disabled={travado} onChange={(e) => setF({ ...f, valor: e.target.value })} data-testid="lanc-valor" /></Campo>
        <Campo rotulo="Data"><input type="date" value={f.data} disabled={travado} onChange={(e) => setF({ ...f, data: e.target.value })} data-testid="lanc-data" /></Campo>
        <div className="campo-largo"><SeletorGrupo st={st} valor={f.grupoId} onChange={(v) => setF({ ...f, grupoId: v })} desabilitado={travado} dica={f.tipo === 'despesa' ? 'A conta responsável pelo grupo é a que paga esta despesa e a que confere com o extrato.' : 'A conta responsável pelo grupo é a que recebe este crédito.'} testid="lanc-grupo" /></div>
        <Campo rotulo="Categoria" className="campo-largo">
          <input list="cats-fin" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} placeholder="Escolha ou digite" data-testid="lanc-categoria" />
          <datalist id="cats-fin">{cats.map((c) => <option key={c} value={c} />)}</datalist>
        </Campo>
      </div>
      {travado && <p className="muted">{l.conciliado ? 'Já conciliado com o banco: só descrição e categoria podem mudar (o grupo e a conta ficam como estão).' : 'Veio de um pagamento ou do banco: só descrição e categoria podem mudar.'}</p>}
      <p className="muted">Com o Open Finance conectado na conta do grupo, o lançamento é conciliado sozinho quando o mesmo valor aparecer no extrato dessa conta.</p>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Modal>
  );
}

const SituacaoLanc = ({ l, of }) => (
  l.conciliado ? <span className="chip chip-p chip-nivel-ok"><Icon n="check" size={12} /> Conciliado</span>
    : of ? <span className="chip chip-p chip-nivel-baixo">Aguardando o banco</span>
      : <span className="chip chip-p">Sem conciliação</span>
);

function Resumo({ mes, st, contaId }) {
  const r = resumoFinanceiro(st, { mesTs: mes, contaId });
  return (
    <>
      <div className="tiles">
        <div className="tile"><small>Créditos</small><b data-testid="fin-creditos">{fmtMoney(r.creditos)}</b></div>
        <div className="tile"><small>Despesas</small><b data-testid="fin-despesas">{fmtMoney(r.despesas)}</b></div>
        <div className="tile destaque"><small>Saldo do mês</small><b data-testid="fin-saldo">{money(r.saldo)}</b></div>
        <div className="tile"><small>Pix a receber</small><b>{fmtMoney(r.pixPendente.total)}</b><small>{r.pixPendente.qtd} {r.pixPendente.qtd === 1 ? 'cobrança' : 'cobranças'}</small></div>
      </div>
      {st.avisosPainel.some((x) => ['devolver', 'revisar'].includes(x.tipo) && !x.lido) && <Aviso tipo="erro" icone="alert"><b>Há agendamentos pagos pendentes de análise.</b> Na ficha do agendamento, escolha: manter como crédito, lançar despesa ou devolvido por fora.</Aviso>}
      {r.decisoes > 0 && <Aviso tipo="erro" icone="alert"><b>{r.decisoes} {r.decisoes === 1 ? 'movimento do banco espera' : 'movimentos do banco esperam'} a sua decisão</b> na aba Conciliação.</Aviso>}
      {(st.financeiro.contas.length > 1 || st.financeiro.grupos.length > 1) && (
        <div className="duas-col">
          <div>
            <h3>Por conta</h3>
            <Tabela id="resumo-contas" testid="resumo-contas" minimo={false} chave={(x) => x.id} linhas={r.porConta} colunas={[
              { id: 'conta', titulo: 'Conta', cel: (x) => x.nome },
              { id: 'creditos', titulo: 'Créditos', cls: 'num', cel: (x) => fmtMoney(x.creditos) },
              { id: 'despesas', titulo: 'Despesas', cls: 'num', cel: (x) => fmtMoney(x.despesas) },
              { id: 'saldo', titulo: 'Saldo', cls: 'num', cel: (x) => money(x.saldo) },
            ]} />
          </div>
          <div>
            <h3>Por grupo de movimentação</h3>
            <Tabela id="resumo-grupos" testid="resumo-grupos" minimo={false} chave={(x) => x.id} linhas={r.porGrupo} colunas={[
              { id: 'grupo', titulo: 'Grupo', cel: (x) => <>{x.nome}<small className="muted"> {x.conta}</small></> },
              { id: 'creditos', titulo: 'Créditos', cls: 'num', cel: (x) => fmtMoney(x.creditos) },
              { id: 'despesas', titulo: 'Despesas', cls: 'num', cel: (x) => fmtMoney(x.despesas) },
              { id: 'saldo', titulo: 'Saldo', cls: 'num', cel: (x) => money(x.saldo) },
            ]} />
          </div>
        </div>
      )}
      <div className="duas-col">
        <div>
          <h3>Despesas por categoria</h3>
          {r.porDespesa.length === 0 ? <p className="muted">Nenhuma despesa neste mês.</p> : <div className="tabela-rolagem"><table className="tabela" style={{ minWidth: 0 }}><tbody>{r.porDespesa.map((x) => <tr key={x.categoria}><td>{x.categoria}</td><td className="num">{fmtMoney(x.valor)}</td></tr>)}</tbody></table></div>}
        </div>
        <div>
          <h3>Créditos por categoria</h3>
          {r.porCredito.length === 0 ? <p className="muted">Nenhum crédito neste mês.</p> : <div className="tabela-rolagem"><table className="tabela" style={{ minWidth: 0 }}><tbody>{r.porCredito.map((x) => <tr key={x.categoria}><td>{x.categoria}</td><td className="num">{fmtMoney(x.valor)}</td></tr>)}</tbody></table></div>}
        </div>
      </div>
    </>
  );
}

function Lancamentos({ mes, st, editar, contaId }) {
  const [tipo, setTipo] = useState('');
  const r = resumoFinanceiro(st, { mesTs: mes, contaId });
  const lista = r.lancs.filter((l) => !tipo || l.tipo === tipo).sort((a, b) => b.data - a.data || b.criadoEm - a.criadoEm);
  return (
    <>
      <div className="filtros-rel">
        <Abas valor={tipo} onChange={setTipo} ordem="lancamentos-tipo" itens={[['', 'Todos'], ['credito', 'Créditos'], ['despesa', 'Despesas']]} />
      </div>
      {lista.length === 0 ? <Vazio icone="list" titulo="Nenhum lançamento neste mês" texto="Use os botões acima para lançar uma despesa ou um crédito." /> : (
        <Tabela id="lancamentos" testid="tabela-lancamentos" chave={(l) => l.id} linhas={lista} colunas={[
          { id: 'data', titulo: 'Data', cel: (l) => fmtDate(l.data) },
          { id: 'descricao', titulo: 'Descrição', cel: (l) => <><b>{l.descricao}</b><small className="muted"> {l.origem === 'pix' ? 'Pix do atendimento' : l.origem === 'banco' ? 'do extrato' : l.origem === 'devolucao' ? 'devolução de Pix' : l.origem === 'atendimento' ? (l.estorno ? 'estorno de atendimento local' : 'atendimento local') : ''}</small></> },
          { id: 'categoria', titulo: 'Categoria', cel: (l) => l.categoria || <span className="muted">—</span> },
          { id: 'grupo', titulo: 'Grupo e conta', cel: (l) => { const g = st.financeiro.grupos.find((x) => x.id === l.grupoId); const ct = contaDe(st, l.contaId); return <><span>{g ? g.nome : <span className="muted">sem grupo</span>}</span><small className="muted"> {ct ? ct.apelido : ''}</small></>; } },
          { id: 'valor', titulo: 'Valor', cls: 'num', clsCel: (l) => (l.tipo === 'despesa' ? 'est-zerado' : 'est-ok'), cel: (l) => <b>{l.tipo === 'despesa' ? '− ' : '+ '}{fmtMoney(l.valor)}</b> },
          { id: 'situacao', titulo: 'Situação', cel: (l) => <SituacaoLanc l={l} of={!!(contaDe(st, l.contaId) || { openFinance: {} }).openFinance.conectado} /> },
          { id: 'acoes', titulo: '', fixa: true, cel: (l) => <Btn tamanho="sm" icone="edit" onClick={() => editar(l)} aria-label={`Editar ${l.descricao}`}>Editar</Btn> },
        ]} rodape={{ rotulo: 'Saldo (créditos − despesas)', celulas: { valor: money(r.saldo) } }} />
      )}
    </>
  );
}

function ConfirmarManual({ c, st, onClose }) {
  const [obs, setObs] = useState('');
  const a = st.agendamentos.find((x) => x.id === c.agendamentoId);
  return (
    <Modal titulo="Confirmar pagamento" sub={a ? `${nomeCliente(st, a)} · ${fmtMoney(c.valor)}` : ''} onClose={onClose} largura={460}
      rodape={<><Btn onClick={onClose}>Voltar</Btn><Btn variante="sucesso" icone="check" onClick={() => { const r = api.confirmarManual(c.id, obs); if (r.ok) { toast(c.enviadaEm ? 'Pagamento confirmado. O cliente foi avisado no WhatsApp.' : 'Pagamento confirmado.'); onClose(); } }} data-testid="confirmar-manual-ok">Confirmar que foi pago</Btn></>}>
      <p>Confirme só depois de ver o dinheiro na conta ou o comprovante. {c.enviadaEm ? 'O cliente receberá o aviso de pagamento no WhatsApp.' : 'O código não foi enviado ao cliente, então nenhum aviso será mandado.'}</p>
      <Campo rotulo="Observação (opcional)"><input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: comprovante enviado pelo cliente" data-testid="obs-manual" /></Campo>
    </Modal>
  );
}

export function PixBloco({ c, st, podeConfirmar, compacto }) {
  const [manual, setManual] = useState(false);
  const copiar = async () => toast((await copiarTexto(c.copiaECola)) ? 'Código Pix copiado.' : 'Não consegui copiar. Selecione o código e copie.', 'ok');
  return (
    <>
      <div className="pix-codigo" data-testid={`pix-codigo-${c.id}`}><code>{c.copiaECola}</code></div>
      <div className="acoes">
        <Btn tamanho="sm" icone="copy" onClick={copiar} data-testid={`pix-copiar-${c.id}`}>Copiar código</Btn>
        {c.status === 'pendente' && <Btn tamanho="sm" icone="send" onClick={() => { const r = api.enviarCobranca(c.id); if (r.ok) toast('Código enviado ao cliente pelo WhatsApp.'); }} data-testid={`pix-enviar-${c.id}`}>{c.enviadaEm ? 'Reenviar no WhatsApp' : 'Enviar no WhatsApp'}</Btn>}
        {c.status === 'pendente' && podeConfirmar && <Btn tamanho="sm" variante="sucesso" icone="check" onClick={() => setManual(true)} data-testid={`pix-confirmar-${c.id}`}>Confirmar pagamento</Btn>}
        {c.status === 'pendente' && <Btn tamanho="sm" variante="perigo" icone="x" onClick={() => { const r = api.cancelarCobranca(c.id); if (r.ok) toast(c.emitidaPor === 'api' ? `Cobrança cancelada no banco (${c.bancoApi}).` : 'Cobrança cancelada.'); else toast(r.erros[0], 'erro'); }} data-testid={`pix-cancelar-${c.id}`}>{c.emitidaPor === 'api' ? 'Cancelar no banco' : 'Cancelar'}</Btn>}
      </div>
      {manual && <ConfirmarManual c={c} st={st} onClose={() => setManual(false)} />}
    </>
  );
}

function Creditos({ st }) {
  const { agora } = useStore();
  const lista = st.financeiro.creditos || [];
  if (!lista.length) return null;
  return (
    <>
      <h3>Créditos de clientes</h3>
      <ul className="ext-lista" data-testid="lista-creditos">
        {lista.map((x) => {
          const cli = st.clientes.find((c) => c.id === x.clienteId);
          const resta = x.valor - x.usos.reduce((t, u) => t + u.valor, 0);
          return (
            <li key={x.id} className="ext ext-conciliado">
              <div className="ext-topo">
                <b>{fmtMoney(resta)}</b>
                <span>{cli ? cli.apelido || cli.nome : '—'} · {x.motivo}</span>
                <small className="muted">{fmtDateTime(x.criadoEm)}{x.usos.length ? ` · usado ${fmtMoney(x.valor - resta)} de ${fmtMoney(x.valor)}` : ''}{resta > 0 ? ` · ${creditoExpirado(x, agora) ? 'expirou' : 'vale até'} ${fmtDate(venceEm(x))}` : ''}</small>
                <span className="chip chip-p">{resta > 0 ? (creditoExpirado(x, agora) ? 'Expirado' : 'Disponível') : 'Usado'}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Cobrancas({ st, user }) {
  const lista = st.financeiro.cobrancas;
  const [aberta, setAberta] = useState(null);
  if (!lista.length) return <Vazio icone="msg" titulo="Nenhuma cobrança Pix ainda" texto="Abra um agendamento na agenda e use Gerar Pix na seção Pagamento." />;
  return (
    <>
    <Tabela id="cobrancas" testid="tabela-cobrancas" chave={(c) => c.id} linhas={lista}
      detalhe={(c) => (aberta === c.id ? <div className="pix-detalhe"><PixBloco c={c} st={st} podeConfirmar /><small className="muted">Identificador {c.txid} · {c.emitidaPor === 'api' ? `gerada pela API do ${c.bancoApi}` : 'código gerado pelo sistema'} · vale até {fmtDateTime(c.expiraEm)}</small></div> : null)}
      colunas={[
        { id: 'criada', titulo: 'Criada', cel: (c) => fmtDateTime(c.criadaEm) },
        { id: 'cliente', titulo: 'Cliente', cel: (c) => { const a = st.agendamentos.find((x) => x.id === c.agendamentoId); return <><b>{a ? nomeCliente(st, a) : '—'}</b><small className="muted"> {(c.servicoIds || (a ? a.servicoIds : [])).map((id) => (st.servicos.find((x) => x.id === id) || {}).nome).filter(Boolean).join(' + ')}</small></>; } },
        { id: 'conta', titulo: 'Conta', cel: (c) => (contaDe(st, c.contaId) || {}).apelido || '—' },
        { id: 'cpf', titulo: 'CPF de quem paga', cel: (c) => cpfMascarado(c.cpf) },
        { id: 'valor', titulo: 'Valor', cls: 'num', cel: (c) => <b>{fmtMoney(c.valor)}</b> },
        { id: 'situacao', titulo: 'Situação', cel: (c) => <><ChipCob c={c} />{c.status === 'paga' && <small className="muted"> {c.via === 'manual' ? 'manual' : c.via === 'api_pix' ? 'API Pix' : 'Open Finance'}</small>}</> },
        { id: 'whatsapp', titulo: 'WhatsApp', cel: (c) => (c.enviadaEm ? <span className="muted">Enviado{c.avisoPagoEm ? ' + aviso de pago' : ''}</span> : <span className="muted">Não enviado</span>) },
        { id: 'acoes', titulo: '', fixa: true, cel: (c) => <Btn tamanho="sm" onClick={() => setAberta(aberta === c.id ? null : c.id)} aria-expanded={aberta === c.id}>{aberta === c.id ? 'Fechar' : 'Detalhes'}</Btn> },
      ]} />
    <Creditos st={st} />
    </>
  );
}

function Classificar({ e, onClose }) {
  const { state: st } = useStore();
  const despesa = e.tipo === 'debito';
  const daConta = st.financeiro.grupos.filter((g) => g.contaId === e.contaId);
  const [categoria, setCategoria] = useState('');
  const [descricao, setDescricao] = useState(e.descricao);
  const [grupoId, setGrupoId] = useState((daConta.find((g) => g.id === st.estabelecimento.grupoMovimentacaoId) || daConta[0] || {}).id || null);
  return (
    <Modal titulo={despesa ? 'Lançar como despesa' : 'Lançar como crédito'} sub={`${fmtMoney(e.valor)} · ${fmtDate(e.em)} · ${(contaDe(st, e.contaId) || {}).apelido || ''}`} onClose={onClose} largura={460}
      rodape={<><Btn onClick={onClose}>Cancelar</Btn><Btn variante="primario" onClick={() => { const r = api.classificarExtrato(e.id, { categoria, descricao, grupoId: grupoId || undefined }); if (r.ok) { toast('Lançamento criado e conciliado.'); onClose(); } else toast(r.erros[0], 'erro'); }} data-testid="classificar-ok">Lançar</Btn></>}>
      <div className="form-grade um">
        <Campo rotulo="Descrição"><input value={descricao} onChange={(x) => setDescricao(x.target.value)} /></Campo>
        <Campo rotulo="Categoria"><input list="cats-ext" value={categoria} onChange={(x) => setCategoria(x.target.value)} placeholder="Escolha ou digite" data-testid="classificar-cat" /><datalist id="cats-ext">{(despesa ? CATEGORIAS_DESPESA : CATEGORIAS_CREDITO).map((c) => <option key={c} value={c} />)}</datalist></Campo>
        {daConta.length > 0 ? <SeletorGrupo st={st} valor={grupoId} onChange={setGrupoId} somenteConta={e.contaId} dica="Só os grupos desta conta." testid="classificar-grupo" /> : <p className="muted">Esta conta ainda não é responsável por nenhum grupo; o lançamento fica sem grupo.</p>}
      </div>
    </Modal>
  );
}

const ChipConta = ({ st, id }) => (st.financeiro.contas.length > 1 ? <span className="chip chip-p chip-conta" data-testid="chip-conta">{(contaDe(st, id) || {}).apelido || '—'}</span> : null);

function Conciliacao({ st, irConta, contaId }) {
  const contas = st.financeiro.contas.filter((c) => !contaId || c.id === contaId);
  const [cls, setCls] = useState(null);
  if (!usaIntegracaoPix(st)) return <Aviso icone="link" tipo="info"><span data-testid="sem-pix-conciliacao">{ERRO_SEM_PIX}</span></Aviso>;
  if (!st.financeiro.contas.some((c) => c.openFinance.conectado || c.apiPix.ativa) && st.financeiro.extrato.length === 0) {
    return (
      <>
        <Aviso icone="link">Sem a API Pix do banco nem o Open Finance, o pagamento de um Pix só é confirmado à mão (botão <b>Confirmar pagamento</b> na cobrança) e as despesas não são conferidas com o banco. Conectando, os pagamentos chegam sozinhos e tudo é conciliado automaticamente, sem importar arquivo OFX. Cada conta tem a sua conexão.</Aviso>
        <Btn variante="primario" icone="link" onClick={irConta} data-testid="ir-conta">Configurar as contas</Btn>
      </>
    );
  }
  const ex = st.financeiro.extrato.filter((e) => !contaId || e.contaId === contaId);
  const decisao = ex.filter((e) => e.status === 'divergente' || e.status === 'a_classificar');
  const feitos = ex.filter((e) => e.status === 'conciliado' || e.status === 'ignorado');
  const Linha = ({ e }) => {
    const cob = e.cobrancaId ? st.financeiro.cobrancas.find((c) => c.id === e.cobrancaId) : null;
    const a = cob ? st.agendamentos.find((x) => x.id === cob.agendamentoId) : null;
    return (
      <li className={`ext ext-${e.status}`} data-testid={`ext-${e.status}`}>
        <div className="ext-topo">
          <b className={e.tipo === 'debito' ? 'est-zerado' : 'est-ok'}>{e.tipo === 'debito' ? '− ' : '+ '}{fmtMoney(e.valor)}</b>
          <span>{e.descricao}{e.contraparte?.nome ? ` · ${e.contraparte.nome}` : ''}{e.contraparte?.cpf ? ` (CPF ${cpfMascarado(e.contraparte.cpf)})` : ''}</span>
          <small className="muted">{fmtDateTime(e.em)}</small>
          <ChipConta st={st} id={e.contaId} />
          <span className={`chip chip-p chip-ext-${e.status}`}>{ROT_EXT[e.status]}</span>
        </div>
        <p className="muted">{e.motivo}{a ? ` Cobrança de ${nomeCliente(st, a)}, ${fmtMoney(cob.valor)}, CPF ${cpfMascarado(cob.cpf)}.` : ''}</p>
        {e.status === 'divergente' && <div className="acoes"><Btn tamanho="sm" variante="sucesso" icone="check" onClick={() => { if (api.autorizarExtrato(e.id).ok) toast('Pagamento autorizado e confirmado.'); }} data-testid="ext-autorizar">Autorizar pagamento</Btn><Btn tamanho="sm" onClick={() => api.rejeitarExtrato(e.id)}>Não é desta cobrança</Btn></div>}
        {e.status === 'a_classificar' && <div className="acoes"><Btn tamanho="sm" variante="primario" onClick={() => setCls(e)} data-testid="ext-classificar">{e.tipo === 'debito' ? 'Lançar como despesa' : 'Lançar como crédito'}</Btn><Btn tamanho="sm" onClick={() => api.ignorarExtrato(e.id)}>Ignorar</Btn></div>}
      </li>
    );
  };
  return (
    <>
      {contas.map((c) => c.openFinance.conectado ? (
        <div className="barra-sync" key={c.id} data-testid={`barra-${c.id}`}>
          <span><Icon n="link" size={16} /> <b>{c.apelido}</b> ({c.banco}) conectada pelo Open Finance · última sincronização {c.openFinance.ultimaSync ? fmtDateTime(c.openFinance.ultimaSync) : 'nunca'}</span>
          <Btn tamanho="sm" icone="repeat" onClick={() => { const r = api.sincronizar(c.id); if (r.ok) toast(r.novos ? `${c.apelido}: ${r.novos} movimentos importados, ${r.conciliados} conciliados.` : `${c.apelido}: nada novo no banco.`); else toast(r.erros[0], 'erro'); }} data-testid={`sincronizar-${c.id}`}>Sincronizar agora</Btn>
        </div>
      ) : (
        <div className="barra-sync" key={c.id} data-testid={`barra-${c.id}`}><span><Icon n="link" size={16} /> <b>{c.apelido}</b>: Open Finance desconectado.{c.apiPix.ativa ? ` Os pagamentos Pix chegam pelo aviso (webhook) da API do ${c.apiPix.banco}.` : ' Os Pix desta conta são confirmados à mão.'}</span></div>
      ))}
      <h3>Aguardando você {decisao.length > 0 && <span className="badge-n">{decisao.length}</span>}</h3>
      {decisao.length === 0 ? <p className="muted">Tudo conciliado. Nada precisa da sua decisão.</p> : <ul className="ext-lista">{decisao.map((e) => <Linha key={e.id} e={e} />)}</ul>}
      <h3>Conciliados e ignorados</h3>
      {feitos.length === 0 ? <p className="muted">Ainda nada.</p> : <ul className="ext-lista">{feitos.slice(0, 40).map((e) => <Linha key={e.id} e={e} />)}</ul>}
      {cls && <Classificar e={cls} onClose={() => setCls(null)} />}
      <ConciliarGrupo st={st} contaId={contaId} />
    </>
  );
}

// Conciliação em grupo: marca itens do banco de um lado e lançamentos do outro; só concilia quando a soma dos dois lados é a mesma.
function ConciliarGrupo({ st, contaId }) {
  const contas = st.financeiro.contas;
  const [conta, setConta] = useState(contaId || contas[0]?.id || '');
  const [exSel, setExSel] = useState([]);
  const [lcSel, setLcSel] = useState([]);
  const exs = extratosConciliaveis(st, conta);
  const tipo = (exs.find((e) => e.id === exSel[0]) || { tipo: 'credito' }).tipo;
  const lcs = lancamentosConciliaveis(st, conta, tipo);
  const soma = (l) => Math.round(l.reduce((t, x) => t + Math.round(x.valor * 100), 0)) / 100;
  const somaE = soma(exs.filter((e) => exSel.includes(e.id))); const somaL = soma(lcs.filter((l) => lcSel.includes(l.id)));
  const bate = exSel.length > 0 && lcSel.length > 0 && Math.round(somaE * 100) === Math.round(somaL * 100);
  const sug = sugestoesConciliacao(st, conta);
  const grupos = (st.financeiro.conciliacoes || []).filter((g) => g.contaId === conta);
  const alterna = (lista, set, id) => set(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  const trocaConta = (v) => { setConta(v); setExSel([]); setLcSel([]); };
  const conciliar = () => { const r = api.conciliarGrupo({ extratoIds: exSel, lancamentoIds: lcSel }); if (r.ok) { toast(`Conciliado: ${fmtMoney(r.conciliacao.valor)}.`); setExSel([]); setLcSel([]); } else toast(r.erros[0], 'erro'); };
  const nomeEx = (id) => st.financeiro.extrato.find((e) => e.id === id);
  return (
    <section className="bloco" data-testid="conciliar-grupo">
      <h3>Conciliar em grupo</h3>
      <p className="muted">Marque os itens do banco e os lançamentos que são a mesma coisa. Um Pix pode cobrir vários atendimentos, e vários Pix podem cobrir vários lançamentos, desde que a soma seja igual.</p>
      {contas.length > 1 && <label className="filtro-conta"><span className="muted">Conta</span><select value={conta} onChange={(e) => trocaConta(e.target.value)} data-testid="grupo-conta">{contas.map((c) => <option key={c.id} value={c.id}>{c.apelido}</option>)}</select></label>}
      {sug.length > 0 && (
        <div className="aviso aviso-info" data-testid="grupo-sugestoes"><div>
          <b>Sugestões</b> (mesmo valor, até 2 dias de diferença)
          {sug.map((x) => { const e = nomeEx(x.extratoId); return (
            <div key={x.extratoId} className="acoes"><span>{fmtMoney(x.valor)} do banco ({e ? fmtDate(e.em) : ''}) = {x.lancamentoIds.length} {x.lancamentoIds.length === 1 ? 'lançamento' : 'lançamentos'}</span>
              <Btn tamanho="sm" onClick={() => { setExSel([x.extratoId]); setLcSel(x.lancamentoIds); }} data-testid="usar-sugestao">Marcar</Btn></div>); })}
        </div></div>
      )}
      <div className="grade-2">
        <div><h4>No banco ({tipo === 'debito' ? 'saídas' : 'entradas'})</h4>
          {exs.length === 0 ? <p className="muted">Nada aguardando.</p> : <ul className="ext-lista">{exs.map((e) => (
            <li key={e.id}><label className="check-linha"><input type="checkbox" checked={exSel.includes(e.id)} onChange={() => { if (exSel.length && !exSel.includes(e.id) && exs.find((x) => x.id === exSel[0]).tipo !== e.tipo) { toast('Marque só entradas ou só saídas.', 'erro'); return; } alterna(exSel, setExSel, e.id); }} data-testid={`gx-${e.id}`} /> <b>{fmtMoney(e.valor)}</b> {e.descricao} <small className="muted">{fmtDate(e.em)}</small></label></li>))}</ul>}
        </div>
        <div><h4>Lançamentos ({tipo === 'debito' ? 'despesas' : 'receitas'})</h4>
          {lcs.length === 0 ? <p className="muted">Nada para conciliar.</p> : <ul className="ext-lista">{lcs.map((l) => (
            <li key={l.id}><label className="check-linha"><input type="checkbox" checked={lcSel.includes(l.id)} onChange={() => alterna(lcSel, setLcSel, l.id)} data-testid={`gl-${l.id}`} /> <b>{fmtMoney(l.valor)}</b> {l.descricao} <small className="muted">{fmtDate(l.data)}</small></label></li>))}</ul>}
        </div>
      </div>
      <p data-testid="grupo-soma" className={bate ? 'msg-ok' : 'muted'}>Banco: <b>{fmtMoney(somaE)}</b> · Lançamentos: <b>{fmtMoney(somaL)}</b>{(exSel.length > 0 || lcSel.length > 0) && !bate && ` · diferença de ${fmtMoney(Math.abs(somaE - somaL))}`}</p>
      <div className="acoes"><Btn variante="primario" icone="check" disabled={!bate} onClick={conciliar} data-testid="conciliar-grupo-ok">Conciliar</Btn></div>
      {grupos.length > 0 && (<><h4>Grupos conciliados</h4><ul className="ext-lista">{grupos.slice(0, 20).map((g) => (
        <li key={g.id} className="acoes" data-testid="grupo-feito"><span><b>{fmtMoney(g.valor)}</b> · {g.extratoIds.length} {g.extratoIds.length === 1 ? 'item do banco' : 'itens do banco'} × {g.lancamentoIds.length} {g.lancamentoIds.length === 1 ? 'lançamento' : 'lançamentos'} · {fmtDateTime(g.em)}</span>
          <Btn tamanho="sm" onClick={() => { const r = api.desfazerConciliacao(g.id); if (r.ok) toast('Conciliação desfeita.'); else toast(r.erros[0], 'erro'); }} data-testid="desfazer-grupo">Desfazer</Btn></li>))}</ul></>)}
    </section>
  );
}

// ---------- contas ----------
function FormConta({ c, onClose, onSalvo }) {
  const [f, setF] = useState(c.id ? { ...c } : { apelido: '', banco: '', agencia: '', conta: '' });
  const [erro, setErro] = useState('');
  const salvar = () => {
    const r = api.salvarConta(f);
    if (!r.ok) { setErro(r.erros[0]); return; }
    toast(c.id ? 'Conta salva.' : 'Conta cadastrada. Agora cadastre a chave Pix dela.'); onSalvo(r.conta); onClose();
  };
  return (
    <Modal titulo={c.id ? 'Editar conta' : 'Nova conta'} onClose={onClose} largura={480}
      rodape={<><Btn onClick={onClose}>Cancelar</Btn><Btn variante="primario" onClick={salvar} data-testid="salvar-conta">Salvar</Btn></>}>
      <div className="form-grade">
        <Campo rotulo="Nome da conta" className="campo-largo" dica="Como você reconhece esta conta, por exemplo “Conta principal”."><input value={f.apelido} onChange={(e) => setF({ ...f, apelido: e.target.value })} data-testid="conta-apelido" /></Campo>
        <Campo rotulo="Banco" className="campo-largo"><select value={f.banco} onChange={(e) => setF({ ...f, banco: e.target.value })} data-testid="conta-banco"><option value="">Escolha…</option>{BANCOS.map((b) => <option key={b}>{b}</option>)}</select></Campo>
        <Campo rotulo="Agência"><input inputMode="numeric" value={f.agencia} onChange={(e) => setF({ ...f, agencia: e.target.value })} data-testid="conta-agencia" /></Campo>
        <Campo rotulo="Conta com dígito"><input value={f.conta} onChange={(e) => setF({ ...f, conta: e.target.value })} data-testid="conta-numero" /></Campo>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Modal>
  );
}

function ConectarBanco({ conta, onClose }) {
  const autorizar = () => {
    const r = api.conectarOpenFinance(conta.id);
    if (!r.ok) { toast(r.erros[0], 'erro'); return; }
    toast(`${conta.apelido} conectada. ${r.novos} movimentos importados e ${r.conciliados} conciliados.`); onClose();
  };
  return (
    <Modal titulo={`Conectar ${conta.apelido} pelo Open Finance`} onClose={onClose} largura={520}
      rodape={<><Btn onClick={onClose}>Cancelar</Btn><Btn variante="primario" icone="check" onClick={autorizar} data-testid="of-autorizar">Autorizar no {conta.banco}</Btn></>}>
      <p>Você será levado ao app do <b>{conta.banco}</b> para autorizar. A {rot('loja')} vai poder:</p>
      <ul className="lista-simples">
        <li>Ler o extrato e o saldo da conta {conta.agencia}/{conta.conta}.</li>
        <li>Receber os Pix pagos nesta conta, para confirmar as cobranças sozinha.</li>
      </ul>
      <p className="muted">Só leitura: ninguém movimenta dinheiro por aqui. O consentimento vale por 12 meses e você pode revogar quando quiser. (Simulado: em produção a autorização acontece no banco.)</p>
    </Modal>
  );
}

function ArquivoCampo({ rotulo, nome, onNome, aceita, testid }) {
  return (
    <div className="campo arquivo">
      <span className="campo-rotulo">{rotulo}</span>
      <label className="btn btn-neutro btn-sm arquivo-btn">
        <Icon n="plus" size={14} /> {nome ? 'Trocar arquivo' : 'Enviar arquivo'}
        <input type="file" accept={aceita} onChange={(e) => { const x = e.target.files && e.target.files[0]; if (x) onNome(x.name); }} data-testid={testid} />
      </label>
      <small className="muted">{nome || 'Nenhum arquivo enviado'}</small>
    </div>
  );
}

function ApiPixCard({ conta }) {
  const a = conta.apiPix;
  const b = bancoApi(conta.banco);
  const urlDe = (amb) => (b ? (amb === 'producao' ? b.urlProducao : b.urlHomologacao) || '' : '');
  const [f, setF] = useState(() => ({ ...a, urlBase: a.urlBase || urlDe(a.ambiente), clientSecret: '' }));
  const [res, setRes] = useState(null);
  const trocaAmb = (amb) => setF({ ...f, ambiente: amb, urlBase: !f.urlBase || f.urlBase === urlDe(f.ambiente) ? urlDe(amb) : f.urlBase });
  const escopo = (k) => setF({ ...f, escopos: f.escopos.includes(k) ? f.escopos.filter((x) => x !== k) : [...f.escopos, k] });
  const testar = () => {
    const sv = api.salvarApiPix(conta.id, f);
    if (!sv.ok) { setRes({ ok: false, erros: sv.erros, passos: [] }); return; }
    const r = api.testarApiPix(conta.id);
    setRes(r);
    setF((x) => ({ ...x, clientSecret: '' }));
    if (r.ok) toast(`API Pix do ${conta.banco} conectada em ${conta.apelido}.`);
  };
  const temSegredo = !!a.clientSecret;
  return (
    <section className="card-fin" data-testid="card-api-pix">
      <div className="card-fin-topo">
        <h3>API Pix do {conta.banco}</h3>
        {a.ativa ? <span className="chip chip-nivel-ok" data-testid="api-ativa"><Icon n="check" size={13} /> Ativa: {a.banco} ({a.ambiente === 'producao' ? 'produção' : 'homologação'})</span> : <span className="chip">Inativa</span>}
      </div>
      <p className="muted">Com a API do banco, o código Pix é gerado no banco, para o CPF de quem paga, e o banco avisa na hora (webhook) quando o pagamento cai: a cobrança é confirmada sozinha. O Open Finance continua servindo para o extrato e a conciliação das despesas. A API vale só para esta conta.</p>
      {!b && <Aviso tipo="erro" icone="alert">O {conta.banco} não está na lista de bancos com API Pix deste sistema. Use o Open Finance e confirme os pagamentos à mão.</Aviso>}
      {b && <Aviso tipo={b.pixApi ? 'info' : 'erro'} icone={b.pixApi ? 'info' : 'alert'}>{b.nota}</Aviso>}
      {b && b.pixApi && (
        <>
          <div className="form-grade">
            <Campo rotulo="Ambiente"><select value={f.ambiente} onChange={(e) => trocaAmb(e.target.value)} data-testid="api-ambiente"><option value="homologacao">Homologação (testes)</option><option value="producao">Produção</option></select></Campo>
            <Campo rotulo="Endereço base da API" className="campo-largo"><input value={f.urlBase} onChange={(e) => setF({ ...f, urlBase: e.target.value })} placeholder="https://… (copie do portal do banco)" data-testid="api-url" /></Campo>
            <Campo rotulo="Client ID"><input value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })} autoComplete="off" data-testid="api-client-id" /></Campo>
            <Campo rotulo="Client secret" dica={temSegredo ? 'Já salvo. Deixe vazio para manter.' : 'Fica guardado cifrado no servidor e nunca volta para a tela.'}><input type="password" value={f.clientSecret} onChange={(e) => setF({ ...f, clientSecret: e.target.value })} autoComplete="new-password" data-testid="api-client-secret" /></Campo>
            {b.extras.map((x) => <Campo key={x.id} rotulo={x.rotulo}><input value={f[x.id] || ''} onChange={(e) => setF({ ...f, [x.id]: e.target.value })} data-testid={`api-${x.id}`} /></Campo>)}
          </div>
          <fieldset className="conj">
            <legend>Certificado digital (mTLS)</legend>
            <div className="form-grade">
              <ArquivoCampo rotulo="Certificado (.cer, .pem)" nome={f.certificadoNome} onNome={(n) => setF({ ...f, certificadoNome: n })} aceita=".cer,.crt,.pem" testid="api-cert" />
              <ArquivoCampo rotulo="Chave privada (.key)" nome={f.chavePrivadaNome} onNome={(n) => setF({ ...f, chavePrivadaNome: n })} aceita=".key,.pem" testid="api-chave" />
              <ArquivoCampo rotulo="Cadeia de certificados (opcional)" nome={f.cadeiaNome} onNome={(n) => setF({ ...f, cadeiaNome: n })} aceita=".cer,.crt,.pem" testid="api-cadeia" />
            </div>
          </fieldset>
          <fieldset className="conj">
            <legend>Permissões (escopos) liberadas na credencial</legend>
            <div className="servicos-lista">{ESCOPOS_PIX.map(([k, r]) => <label key={k} className={`servico-op ${f.escopos.includes(k) ? 'on' : ''}`}><input type="checkbox" checked={f.escopos.includes(k)} onChange={() => escopo(k)} data-testid={`escopo-${k}`} /><span><b>{k}</b><small className="muted"> {r}</small></span></label>)}</div>
          </fieldset>
          <Campo rotulo="Endereço do webhook (aviso de pagamento)" dica="Precisa ser HTTPS e acessível pela internet. O sistema o registra no banco ao testar."><input value={f.webhookUrl} onChange={(e) => setF({ ...f, webhookUrl: e.target.value })} data-testid="api-webhook" /></Campo>
          <p className="muted">Simulado: aqui só o nome dos arquivos é guardado. Em produção o certificado, a chave e o secret vão cifrados para o servidor.</p>
          {res && (
            <div className="teste-passos" data-testid="api-passos">
              <ul>{res.passos.map((p) => <li key={p.rotulo} className={p.ok ? 'ok' : 'falha'}><Icon n={p.ok ? 'check' : 'x'} size={15} /><span><b>{p.rotulo}</b> <small className="muted">{p.detalhe}</small></span></li>)}</ul>
              {!res.ok && <Aviso tipo="erro">{res.erros[0]}</Aviso>}
            </div>
          )}
          <div className="acoes">
            <Btn variante="primario" icone="zap" onClick={testar} data-testid="api-testar">Salvar e testar conexão</Btn>
            {a.ativa && <Btn variante="perigo" onClick={() => { api.desativarApiPix(conta.id); setRes(null); toast('API Pix desativada.'); }} data-testid="api-desativar">Desativar</Btn>}
          </div>
        </>
      )}
    </section>
  );
}

function ChavePix({ conta }) {
  const [p, setP] = useState({ ...conta.pix });
  const [erro, setErro] = useState('');
  return (
    <section className="card-fin">
      <h3>Chave Pix que recebe nesta conta</h3>
      <div className="form-grade um">
        <Campo rotulo="Tipo da chave"><select value={p.tipoChave} onChange={(e) => setP({ ...p, tipoChave: e.target.value })}><option value="aleatoria">Aleatória</option><option value="cnpj">CNPJ</option><option value="cpf">CPF</option><option value="email">E-mail</option><option value="telefone">Telefone</option></select></Campo>
        <Campo rotulo="Chave"><input value={p.chave} onChange={(e) => setP({ ...p, chave: e.target.value })} data-testid="pix-chave" /></Campo>
        <Campo rotulo="Nome do recebedor"><input value={p.recebedor} onChange={(e) => setP({ ...p, recebedor: e.target.value })} /></Campo>
        <Campo rotulo="Cidade"><input value={p.cidade} onChange={(e) => setP({ ...p, cidade: e.target.value })} /></Campo>
        <Campo rotulo="Validade da cobrança (horas)"><input type="number" min="1" value={p.validadeH} onChange={(e) => setP({ ...p, validadeH: e.target.value })} /></Campo>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <Btn variante="primario" onClick={() => { const r = api.salvarPix(conta.id, p); if (!r.ok) setErro(r.erros[0]); else { setErro(''); toast('Chave Pix salva.'); } }} data-testid="salvar-pix">Salvar</Btn>
    </section>
  );
}

function OpenFinanceCard({ conta }) {
  const of = conta.openFinance;
  const [conectar, setConectar] = useState(false);
  return (
    <section className="card-fin">
      <h3>Open Finance (extrato e conciliação)</h3>
      {of.conectado ? (
        <>
          <p><span className="chip chip-nivel-ok"><Icon n="check" size={13} /> Conectado</span></p>
          <p><b>{conta.banco}</b> · agência {conta.agencia} · conta {conta.conta}</p>
          <p className="muted">Consentimento desde {fmtDate(of.consentimentoEm)}, vale até {fmtDate(of.validoAte)}. Última sincronização: {of.ultimaSync ? fmtDateTime(of.ultimaSync) : 'nunca'}.</p>
          <Btn variante="perigo" onClick={() => { api.desconectarOpenFinance(conta.id); toast('Banco desconectado.'); }} data-testid="of-desconectar">Desconectar</Btn>
        </>
      ) : (
        <>
          <p className="muted">Conecte esta conta. O extrato dela chega sozinho (sem importar arquivo OFX): os Pix pagos confirmam as cobranças e as despesas do grupo desta conta são conferidas com o banco.</p>
          <Btn variante="primario" icone="link" onClick={() => setConectar(true)} data-testid="of-conectar">Conectar banco</Btn>
        </>
      )}
      {conectar && <ConectarBanco conta={conta} onClose={() => setConectar(false)} />}
    </section>
  );
}

function Contas({ st }) {
  const contas = st.financeiro.contas;
  const [sel, setSel] = useState(contas[0].id);
  const [edit, setEdit] = useState(null);
  const conta = contas.find((c) => c.id === sel) || contas[0];
  const grupos = st.financeiro.grupos.filter((g) => g.contaId === conta.id);
  return (
    <div className="pilha-fin">
      <div className="contas-topo">
        <Abas valor={conta.id} onChange={setSel} ordem="contas" itens={contas.map((c) => [c.id, c.apelido])} />
        <Btn icone="plus" onClick={() => setEdit({})} data-testid="nova-conta">Nova conta</Btn>
      </div>
      <section className="card-fin" data-testid="conta-cabeca">
        <div className="card-fin-topo">
          <h3>{conta.apelido}</h3>
          <span className="acoes">
            <span className={`chip chip-p ${conta.apiPix.ativa ? 'chip-nivel-ok' : ''}`}>{conta.apiPix.ativa ? 'API Pix ativa' : 'API Pix inativa'}</span>
            <span className={`chip chip-p ${conta.openFinance.conectado ? 'chip-nivel-ok' : ''}`}>{conta.openFinance.conectado ? 'Open Finance conectado' : 'Open Finance desconectado'}</span>
          </span>
        </div>
        <p><b>{conta.banco}</b> · agência {conta.agencia} · conta {conta.conta}</p>
        <p className="muted">{grupos.length ? <>Responsável pelos grupos: {grupos.map((g) => g.id === st.estabelecimento.grupoMovimentacaoId ? `${g.nome} (padrão)` : g.nome).join(', ')}.</> : 'Nenhum grupo de movimentação aponta para esta conta ainda. Defina na aba Grupos.'}</p>
        <div className="acoes">
          <Btn tamanho="sm" icone="edit" onClick={() => setEdit(conta)} data-testid="editar-conta">Editar conta</Btn>
          <Btn tamanho="sm" variante="perigo" icone="trash" onClick={() => { const r = api.removerConta(conta.id); if (r.ok) { toast('Conta removida.'); setSel(contas.find((c) => c.id !== conta.id).id); } else toast(r.erros[0], 'erro'); }} data-testid="remover-conta">Remover conta</Btn>
        </div>
      </section>
      <OpenFinanceCard key={`of-${conta.id}`} conta={conta} />
      <ChavePix key={`pix-${conta.id}`} conta={conta} />
      <ApiPixCard key={`api-${conta.id}-${conta.banco}`} conta={conta} />
      {edit && <FormConta c={edit} onClose={() => setEdit(null)} onSalvo={(c) => setSel(c.id)} />}
    </div>
  );
}

// ---------- grupos de movimentação ----------
function FormGrupo({ g, st, onClose }) {
  const [f, setF] = useState(g.id ? { ...g } : { nome: '', contaId: st.financeiro.contas[0].id });
  const [erro, setErro] = useState('');
  const salvar = () => { const r = api.salvarGrupo(f); if (!r.ok) { setErro(r.erros[0]); return; } toast(g.id ? 'Grupo salvo.' : 'Grupo criado.'); onClose(); };
  return (
    <Modal titulo={g.id ? 'Editar grupo' : 'Novo grupo de movimentação'} onClose={onClose} largura={480}
      rodape={<><Btn onClick={onClose}>Cancelar</Btn><Btn variante="primario" onClick={salvar} data-testid="salvar-grupo">Salvar</Btn></>}>
      <div className="form-grade um">
        <Campo rotulo="Nome do grupo" dica="Por exemplo “Geral”, “Fornecedores e produtos” ou o nome de um sócio."><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} data-testid="grupo-nome" /></Campo>
        <Campo rotulo="Conta responsável" dica="Recebe os Pix dos serviços do grupo e paga as despesas do grupo.">
          <select value={f.contaId} onChange={(e) => setF({ ...f, contaId: e.target.value })} data-testid="grupo-conta">{st.financeiro.contas.map((c) => <option key={c.id} value={c.id}>{c.apelido} · {c.banco}</option>)}</select>
        </Campo>
      </div>
      {g.id && <p className="muted">Mudar a conta vale daqui para a frente: o que já foi cobrado ou lançado fica na conta de origem.</p>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Modal>
  );
}

function Grupos({ st }) {
  const [edit, setEdit] = useState(null);
  return (
    <>
      <Aviso icone="info">O <b>grupo de movimentação</b> diz qual conta é responsável pelo dinheiro. Ele é escolhido no <b>estabelecimento</b> (padrão), em cada <b>serviço</b> (opcional) e em cada <b>despesa ou crédito</b>. O Pix de um serviço vai para a chave da conta do grupo dele; a despesa é conferida com o extrato dessa conta.</Aviso>
      <div className="acoes"><Btn variante="primario" icone="plus" onClick={() => setEdit({})} data-testid="novo-grupo">Novo grupo</Btn></div>
      <Tabela id="grupos" testid="tabela-grupos" chave={(g) => g.id} linhas={st.financeiro.grupos} linhaProps={(g) => ({ 'data-testid': `grupo-${g.id}` })} colunas={[
        { id: 'grupo', titulo: 'Grupo', cel: (g) => <><b>{g.nome}</b>{usoDoGrupo(st, g.id).estabelecimento && <span className="chip chip-p chip-nivel-ok"> Padrão do estabelecimento</span>}</> },
        { id: 'conta', titulo: 'Conta responsável', cel: (g) => { const ct = contaDe(st, g.contaId); return ct ? <>{ct.apelido} <small className="muted">{ct.banco}</small></> : '—'; } },
        { id: 'uso', titulo: 'Onde é usado', cls: 'muted', cel: (g) => { const u = usoDoGrupo(st, g.id); return [u.servicos.length ? `Serviços: ${u.servicos.map((x) => x.nome).join(', ')}` : '', u.lancamentos ? `${u.lancamentos} ${u.lancamentos === 1 ? 'lançamento' : 'lançamentos'}` : ''].filter(Boolean).join(' · ') || (u.estabelecimento ? 'Serviços sem grupo próprio' : 'Ainda sem uso'); } },
        { id: 'acoes', titulo: '', fixa: true, cls: 'acoes', cel: (g) => <><Btn tamanho="sm" icone="edit" onClick={() => setEdit(g)} aria-label={`Editar ${g.nome}`}>Editar</Btn><Btn tamanho="sm" variante="perigo" icone="trash" onClick={() => { const r = api.removerGrupo(g.id); if (r.ok) toast('Grupo removido.'); else toast(r.erros[0], 'erro'); }} aria-label={`Remover ${g.nome}`}>Remover</Btn></> },
      ]} />
      {edit && <FormGrupo g={edit} st={st} onClose={() => setEdit(null)} />}
    </>
  );
}

export default function Financeiro({ user }) {
  const { state: st, agora } = useStore();
  const [aba, setAba] = useState('resumo');
  const [mes, setMes] = useState(() => monthStart(agora));
  const [edit, setEdit] = useState(null);
  const [contaId, setContaId] = useState('');
  const mostraMes = aba === 'resumo' || aba === 'lancamentos';
  const mostraConta = st.financeiro.contas.length > 1 && ['resumo', 'lancamentos', 'conciliacao'].includes(aba);
  return (
    <section className="tela">
      <header className="tela-topo">
        <h1>Financeiro</h1>
        <div className="acoes">
          <Btn icone="plus" onClick={() => setEdit({ tipo: 'credito' })} data-testid="novo-credito">Novo crédito</Btn>
          <Btn variante="primario" icone="plus" onClick={() => setEdit({ tipo: 'despesa' })} data-testid="nova-despesa">Nova despesa</Btn>
        </div>
      </header>
      <Abas valor={aba} onChange={setAba} ordem="financeiro" itens={[['resumo', 'Resumo'], ['lancamentos', 'Lançamentos'], ...(usaIntegracaoPix(st) ? [['cobrancas', 'Cobranças Pix']] : []), ['conciliacao', 'Conciliação'], ['contas', 'Contas'], ['grupos', 'Grupos']]} />
      <div className="filtros-fin">
        {mostraMes && <NavMes mes={mes} setMes={setMes} agora={agora} />}
        {mostraConta && (
          <label className="filtro-conta"><span className="muted">Conta</span>
            <select value={contaId} onChange={(e) => setContaId(e.target.value)} data-testid="filtro-conta"><option value="">Todas as contas</option>{st.financeiro.contas.map((c) => <option key={c.id} value={c.id}>{c.apelido}</option>)}</select>
          </label>
        )}
      </div>
      {aba === 'resumo' && <Resumo mes={mes} st={st} contaId={contaId} />}
      {aba === 'lancamentos' && <Lancamentos mes={mes} st={st} editar={setEdit} contaId={contaId} />}
      {aba === 'cobrancas' && usaIntegracaoPix(st) && <Cobrancas st={st} user={user} />}
      {aba === 'conciliacao' && <Conciliacao st={st} irConta={() => setAba('contas')} contaId={contaId} />}
      {aba === 'contas' && <Contas st={st} />}
      {aba === 'grupos' && <Grupos st={st} />}
      {edit && <FormLancamento l={edit} onClose={() => setEdit(null)} />}
    </section>
  );
}
