/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Bloco "Plano" da ficha do cliente (Artifact), para quem tem a seção Planos: plano em andamento (saldo, vencimento, horários fixos), histórico curto, "Sem plano" com
// Adicionar plano, e as ações Editar (trocar de plano, horários fixos, mensalidade) e Encerrar. Só reaproveita `planos.*` de api.js (a mesma da aba Planos): o saldo é
// derivado dos atendimentos pelo domínio, nada é calculado nem digitado aqui. O aviso e a recarga moram na tela pai (Clientes): este bloco recarrega sem perder nada.
import React, { useState } from 'react';
import { planos as api } from '../services/api.js';
import { fmtDate, fmtMoney, DIAS_CURTOS } from '../domain/time.js';
import { SITUACAO, rotuloMes, somaMeses } from '../domain/planos.js';
import { avisoTrocaParcial, motivoValido, resumoDoCliente, textoVencimento } from '../domain/plano-cliente.js';
import { Aviso, Btn, Campo, Modal } from './common.jsx';
import { FormEncerrar, FormFixos, FormMensalidade } from './Planos.jsx';
import { toast, useStore } from './hooks.js';

const plural = (n, um, varios) => (n === 1 ? um : varios);
const opcaoDoPlano = (p) => `${p.nome} · ${fmtMoney(p.preco)}/mês · ${p.cortes} ${plural(p.cortes, 'atendimento', 'atendimentos')}`;

export function BlocoPlano({ cliente, aviso, versao, aoAbrir, aoFeito, aoIr }) {
  const { state: st } = useStore();
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(false);
  const dados = React.useMemo(() => api.listar(), [st, versao]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!dados.ok) return null;
  const r = resumoDoCliente(dados, cliente.id);
  const a = r.aberta;
  const quitar = (x) => { const q = api.quitar(x.id); if (q.ok) { setErro(''); toast('Dívida quitada.'); aoFeito('Dívida quitada.'); } else setErro(q.erros[0]); };
  return (
    <fieldset className="conj plano-cliente" data-testid="plano-cliente">
      <legend>Plano</legend>
      {aviso && <div data-testid="plano-cli-aviso"><Aviso>{aviso}</Aviso></div>}
      {erro && <div data-testid="plano-cli-erro"><Aviso tipo="erro">{erro}</Aviso></div>}
      {a ? (
        <div data-testid="plano-cli-ativo">
          <p><b data-testid="plano-cli-nome">{a.plano.nome}</b> <span className="chip chip-p" data-testid="plano-cli-situacao">{a.status === 'pendente' ? SITUACAO.pendente : a.saldo.atrasado ? 'Mensalidade atrasada' : SITUACAO.ativa}</span> <small className="muted">{fmtMoney(a.plano.preco)}/mês</small></p>
          {a.status === 'ativa' && <p data-testid="plano-cli-saldo">Atendimentos que restam: <b>{a.saldo.restantes}</b> de {a.plano.cortes}{a.saldo.maisPermitidos > 0 ? <small className="muted"> (+{a.saldo.maisPermitidos} adiantável)</small> : null}</p>}
          <p className="muted" data-testid="plano-cli-venc">{textoVencimento(a, { emAberto: r.emAberto, mes: dados.mes })}{a.saldo.validoAte ? ` · vale até ${rotuloMes(a.saldo.validoAte)}` : ''}</p>
          <p className="muted" data-testid="plano-cli-fixos">Horários fixos: {(a.fixos || []).length ? a.fixos.map((f) => `${DIAS_CURTOS[f.dia]} ${f.hm}`).join(' · ') : 'nenhum'}</p>
          <div className="acoes">
            <Btn tamanho="sm" icone="edit" onClick={() => setEditando(!editando)} aria-expanded={editando} data-testid="plano-cli-editar">Editar plano</Btn>
            <Btn tamanho="sm" variante="perigo" onClick={() => aoAbrir({ tipo: 'encerrar', a })} data-testid="plano-cli-encerrar">Encerrar plano</Btn>
          </div>
          {editando && (
            <div className="acoes" data-testid="plano-cli-editar-acoes">
              <Btn tamanho="sm" onClick={() => aoAbrir({ tipo: 'trocar', a })} disabled={r.dividaPrevista > 0 || !r.catalogo.some((p) => p.id !== a.planoId)} data-testid="plano-cli-trocar">Trocar de plano</Btn>
              <Btn tamanho="sm" onClick={() => aoAbrir({ tipo: 'fixos', a })} data-testid="plano-cli-fixos-btn">Horários fixos</Btn>
              <Btn tamanho="sm" onClick={() => aoAbrir({ tipo: 'pagar', a, mes: dados.mes })} data-testid="plano-cli-mensalidade">Registrar mensalidade</Btn>
            </div>
          )}
          {editando && r.dividaPrevista > 0 && <p className="muted" data-testid="plano-cli-troca-bloqueada">Há {r.dividaPrevista} {plural(r.dividaPrevista, 'atendimento adiantado', 'atendimentos adiantados')} sem pagar: trocar agora deixaria dívida. Registre a mensalidade antes.</p>}
        </div>
      ) : (
        <div data-testid="plano-cli-vazio">
          <p className="muted">Sem plano.</p>
          {r.divida > 0 && <Aviso tipo="erro">Este cliente encerrou um plano devendo {r.divida} {plural(r.divida, 'atendimento', 'atendimentos')} e não pode assinar outro até quitar.</Aviso>}
          {r.catalogo.length > 0 ? (
            <Btn tamanho="sm" variante="primario" icone="plus" onClick={() => aoAbrir({ tipo: 'adicionar' })} data-testid="plano-cli-adicionar">Adicionar plano</Btn>
          ) : (
            <div data-testid="plano-cli-sem-catalogo">
              <Aviso>Nenhum plano cadastrado ainda. Crie um na aba Planos para poder adicionar a este cliente.</Aviso>
              {aoIr && <Btn tamanho="sm" onClick={() => aoIr('planos')} data-testid="plano-cli-ir-planos">Ir para Planos</Btn>}
            </div>
          )}
        </div>
      )}
      {r.divida > 0 && r.historico.some((h) => h.divida > 0 && !h.dividaQuitada) && (
        <div className="acoes">{r.historico.filter((h) => h.divida > 0 && !h.dividaQuitada).map((h) => <Btn key={h.id} tamanho="sm" onClick={() => quitar(h)} data-testid={`plano-cli-quitar-${h.id}`}>Quitar dívida ({h.plano.nome})</Btn>)}</div>
      )}
      {r.historico.length > 0 && (
        <div data-testid="plano-cli-historico">
          <small className="muted">Planos anteriores</small>
          <ul className="valores-lista">
            {r.historico.map((h) => <li key={h.id} className="v-linha" data-testid={`plano-cli-hist-${h.id}`}><span>{h.plano.nome} · encerrado em {h.encerradoEm ? fmtDate(h.encerradoEm) : '—'}{h.divida > 0 && !h.dividaQuitada ? ` · dívida de ${h.divida}` : ''}</span></li>)}
          </ul>
        </div>
      )}
    </fieldset>
  );
}

// Os formulários ficam na tela pai (Clientes), por cima da ficha: quando fecham, o aviso já está lá e a ficha não perdeu o que foi digitado.
export function ModaisPlano({ modo, cliente, aoFechar, aoFeito }) {
  const { state: st } = useStore();
  if (!modo) return null;
  if (modo.tipo === 'pagar') return <FormMensalidade a={modo.a} mesInicial={modo.mes} onClose={aoFechar} aoFeito={aoFeito} />;
  if (modo.tipo === 'encerrar') return <FormEncerrar a={modo.a} onClose={aoFechar} aoFeito={aoFeito} />;
  if (modo.tipo === 'fixos') return <FormFixos a={modo.a} st={st} onClose={aoFechar} aoFeito={aoFeito} />;
  return <FormEscolherPlano modo={modo} cliente={cliente} onClose={aoFechar} aoFeito={aoFeito} />;
}

// Adicionar (cliente sem plano) e Trocar (encerra o atual com motivo e abre o novo): os dois chamam `planos.encerrar` / `planos.contratar`, as mesmas da aba Planos.
function FormEscolherPlano({ modo, cliente, onClose, aoFeito }) {
  const troca = modo.tipo === 'trocar';
  const dados = React.useMemo(() => api.listar(), []);
  const opcoes = dados.ok ? dados.planos.filter((p) => p.ativo !== false && (!troca || p.id !== modo.a.planoId)) : [];
  const [planoId, setPlanoId] = useState(opcoes[0]?.id || '');
  const [inicioMes, setInicioMes] = useState(dados.mes);
  const [dia, setDia] = useState(5);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const salvar = () => {
    if (troca && !motivoValido(motivo)) { setErro('Diga o motivo da troca (5 a 200 letras).'); return; }
    if (troca) {
      const e = api.encerrar(modo.a.id, motivo);
      if (!e.ok) { setErro(e.erros[0]); return; }
    }
    const c = api.contratar({ clienteId: cliente.id, planoId, inicioMes, diaCobranca: dia });
    if (!c.ok) {
      if (troca) { toast('O plano novo não foi criado.', 'erro'); aoFeito(avisoTrocaParcial(c.erros[0])); onClose(); return; }
      setErro(c.erros[0]); return;
    }
    const msg = troca ? 'Plano trocado. Registre a mensalidade do novo plano quando receber.' : 'Plano adicionado. Registre a mensalidade quando receber.';
    toast(msg); aoFeito(msg); onClose();
  };
  return (
    <Modal titulo={troca ? `Trocar de plano · ${cliente.nome}` : `Adicionar plano · ${cliente.nome}`} onClose={onClose} largura={560} sub={troca ? `Plano atual: ${modo.a.plano.nome}` : undefined}
      rodape={<><Btn onClick={onClose}>Cancelar</Btn><Btn variante="primario" onClick={salvar} data-testid="plano-cli-salvar">{troca ? 'Trocar plano' : 'Adicionar plano'}</Btn></>}>
      <div className="form-grade um">
        <Campo rotulo={troca ? 'Novo plano' : 'Plano'}>
          <select value={planoId} onChange={(e) => setPlanoId(e.target.value)} data-testid="plano-cli-plano">
            {opcoes.map((p) => <option key={p.id} value={p.id}>{opcaoDoPlano(p)}</option>)}
          </select>
        </Campo>
        {troca && <Campo rotulo="Motivo da troca (5 a 200 letras)"><input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} data-testid="plano-cli-motivo" /></Campo>}
        <Campo rotulo="Começa em">
          <select value={inicioMes} onChange={(e) => setInicioMes(e.target.value)} data-testid="plano-cli-inicio">
            {[-2, -1, 0, 1, 2, 3].map((n) => { const m = somaMeses(dados.mes, n); return <option key={m} value={m}>{rotuloMes(m)}</option>; })}
          </select>
        </Campo>
        <Campo rotulo="Dia de cobrança (1 a 28)"><input type="number" min="1" max="28" value={dia} onChange={(e) => setDia(e.target.value)} data-testid="plano-cli-dia" /></Campo>
      </div>
      {troca && <p className="muted">O plano atual é encerrado (os horários fixos futuros saem da agenda) e o novo começa sem mensalidade paga.</p>}
      {erro && <div data-testid="plano-cli-erro-form"><Aviso tipo="erro">{erro}</Aviso></div>}
    </Modal>
  );
}
