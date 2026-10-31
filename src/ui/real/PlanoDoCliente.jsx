/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Bloco "Plano" da ficha do cliente no site real, para quem tem a seção Planos (quem não tem nem monta o bloco, então nem chama a API): plano em andamento
// (saldo, vencimento), histórico curto, "Sem plano" com Adicionar plano, Editar (trocar de plano, registrar mensalidade) e Encerrar. Só usa `planos.*` de api-real.js
// (as rotas de V32 que a aba Planos já usa); o saldo e a dívida vêm do servidor, derivados dos atendimentos.
// O aviso, a recarga e o formulário aberto moram na tela pai (Clientes): este bloco recarrega sem perder nada.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs). Classes de CSS próprias terminam em `-real`.
import React, { useEffect, useState } from 'react';
import { planos as api } from '../../services/api-real.js';
import { SITUACAO, rotuloMes, somaMeses } from '../../domain/planos.js';
import { avisoTrocaParcial, motivoValido, resumoDoCliente, textoVencimento } from '../../domain/plano-cliente.js';
import { fmtDate, fmtMoney } from '../../domain/time.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';
import { Rodape, resumoFixos, usarEnvio } from './Planos.jsx';

const plural = (n, um, varios) => (n === 1 ? um : varios);
const opcaoDoPlano = (p) => `${p.nome} · ${fmtMoney(p.preco)}/mês · ${p.cortes} ${plural(p.cortes, 'atendimento', 'atendimentos')}`;

export function BlocoPlanoReal({ cliente, aviso, versao, aoAbrir, aoFeito, aoIr }) {
  const [dados, setDados] = useState(null); // null = carregando
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(false);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await api.listar();
      if (!vivo) return;
      if (!r.ok) { setErro(r.erro); setDados((d) => d || { planos: [], assinaturas: [], aReceber: [], mes: '' }); return; }
      setErro(''); setDados(r);
    })();
    return () => { vivo = false; };
  }, [versao]);
  if (dados === null) return <fieldset className="conj" data-testid="plano-cliente"><legend>Plano</legend><p className="muted" role="status" data-testid="plano-cli-carregando">Carregando…</p></fieldset>;
  const r = resumoDoCliente(dados, cliente.id);
  const a = r.aberta;
  const quitar = async (x) => {
    const q = await api.quitar(x.id);
    if (!q.ok) { setErro(q.erro); return; }
    setErro(''); aoFeito('Dívida quitada.');
  };
  return (
    <fieldset className="conj" data-testid="plano-cliente">
      <legend>Plano</legend>
      {aviso && <Aviso data-testid="plano-cli-aviso"><span role="status">{aviso}</span></Aviso>}
      {erro && <Aviso tipo="erro" data-testid="plano-cli-erro">{erro}</Aviso>}
      {a ? (
        <div data-testid="plano-cli-ativo">
          <p><b data-testid="plano-cli-nome">{a.plano.nome}</b> <span className="chip chip-p" data-testid="plano-cli-situacao">{a.status === 'pendente' ? SITUACAO.pendente : a.saldo.atrasado ? 'Mensalidade atrasada' : SITUACAO.ativa}</span> <small className="muted">{fmtMoney(a.plano.preco)}/mês</small></p>
          {a.status === 'ativa' && <p data-testid="plano-cli-saldo">Atendimentos que restam: <b>{a.saldo.restantes}</b> de {a.plano.cortes}{a.saldo.maisPermitidos > 0 ? <small className="muted"> (+{a.saldo.maisPermitidos} adiantável)</small> : null}</p>}
          <p className="muted" data-testid="plano-cli-fixos">Horários fixos: {resumoFixos(a)}</p>
          <p className="muted" data-testid="plano-cli-venc">{textoVencimento(a, { emAberto: r.emAberto, mes: dados.mes })}</p>
          <div className="acoes">
            <Btn tamanho="sm" onClick={() => setEditando(!editando)} aria-expanded={editando} data-testid="plano-cli-editar"><Icone n="edit" size={15} /> Editar plano</Btn>
            <Btn tamanho="sm" variante="perigo" onClick={() => aoAbrir({ tipo: 'encerrar', a })} data-testid="plano-cli-encerrar">Encerrar plano</Btn>
          </div>
          {editando && (
            <div className="acoes" data-testid="plano-cli-editar-acoes">
              <Btn tamanho="sm" onClick={() => aoAbrir({ tipo: 'trocar', a, planos: dados.planos, mes: dados.mes })} disabled={r.dividaPrevista > 0 || !r.catalogo.some((p) => p.id !== a.planoId)} data-testid="plano-cli-trocar">Trocar de plano</Btn>
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
            <Btn tamanho="sm" variante="primario" onClick={() => aoAbrir({ tipo: 'adicionar', planos: dados.planos, mes: dados.mes })} data-testid="plano-cli-adicionar"><Icone n="plus" size={15} /> Adicionar plano</Btn>
          ) : (
            <div data-testid="plano-cli-sem-catalogo">
              <Aviso>Nenhum plano cadastrado ainda. Crie um na aba Planos para poder adicionar a este cliente.</Aviso>
              {aoIr && <Btn tamanho="sm" onClick={() => aoIr('planos')} data-testid="plano-cli-ir-planos">Ir para Planos</Btn>}
            </div>
          )}
        </div>
      )}
      {r.historico.some((h) => h.divida > 0 && !h.dividaQuitada) && (
        <div className="acoes">{r.historico.filter((h) => h.divida > 0 && !h.dividaQuitada).map((h) => <Btn key={h.id} tamanho="sm" onClick={() => quitar(h)} data-testid={`plano-cli-quitar-${h.id}`}>Quitar dívida ({h.plano.nome})</Btn>)}</div>
      )}
      {r.historico.length > 0 && (
        <div data-testid="plano-cli-historico">
          <small className="muted">Planos anteriores</small>
          <ul className="clientes-lista">
            {r.historico.map((h) => <li key={h.id} data-testid={`plano-cli-hist-${h.id}`}>{h.plano.nome} · encerrado em {h.encerradoEm ? fmtDate(h.encerradoEm) : '—'}{h.divida > 0 && !h.dividaQuitada ? ` · dívida de ${h.divida}` : ''}</li>)}
          </ul>
        </div>
      )}
    </fieldset>
  );
}

// Adicionar (cliente sem plano) e Trocar (encerra o atual com motivo e abre o novo): `planos.encerrar` e `planos.contratar`, as mesmas da aba Planos.
// Cada uma ocupa a tela, como os outros formulários do site real; a ficha continua montada por baixo (escondida) e não perde o que foi digitado.
export function FormEscolherPlanoReal({ modo, cliente, aoCancelar, aoFeito }) {
  const troca = modo.tipo === 'trocar';
  const opcoes = modo.planos.filter((p) => p.ativo && (!troca || p.id !== modo.a.planoId));
  const [planoId, setPlanoId] = useState(opcoes[0] ? opcoes[0].id : '');
  const [inicioMes, setInicioMes] = useState(modo.mes);
  const [dia, setDia] = useState('5');
  const [motivo, setMotivo] = useState('');
  const { erro, enviando, enviar } = usarEnvio(async () => {
    if (troca && !motivoValido(motivo)) return { ok: false, erro: 'Diga o motivo da troca (5 a 200 letras).' };
    if (troca) {
      const e = await api.encerrar(modo.a.id, motivo);
      if (!e.ok) return e;
    }
    const c = await api.contratar({ clienteId: cliente.id, planoId, inicioMes, diaCobranca: dia });
    if (c.ok) return { ok: true, aviso: troca ? 'Plano trocado. Registre a mensalidade do novo plano quando receber.' : 'Plano adicionado. Registre a mensalidade quando receber.' };
    return troca ? { ok: true, aviso: avisoTrocaParcial(c.erro) } : c; // trocar: o anterior já foi encerrado, então a pessoa precisa saber disso
  }, (r) => aoFeito(r.aviso));
  return (
    <section className="tela" data-testid={troca ? 'plano-cli-trocar-form' : 'plano-cli-adicionar-form'}>
      <header className="tela-topo"><h1>{troca ? 'Trocar de plano' : 'Adicionar plano'} · {cliente.nome}</h1></header>
      <form onSubmit={enviar} className="form-grade um">
        {troca && <p className="muted">Plano atual: {modo.a.plano.nome}</p>}
        <Campo rotulo={troca ? 'Novo plano' : 'Plano'}>
          <select value={planoId} onChange={(e) => setPlanoId(e.target.value)} data-testid="plano-cli-plano">
            {opcoes.map((p) => <option key={p.id} value={p.id}>{opcaoDoPlano(p)}</option>)}
          </select>
        </Campo>
        {troca && <Campo rotulo="Motivo da troca (5 a 200 letras)"><input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} data-testid="plano-cli-motivo" /></Campo>}
        <Campo rotulo="Começa em">
          <select value={inicioMes} onChange={(e) => setInicioMes(e.target.value)} data-testid="plano-cli-inicio">
            {[-2, -1, 0, 1, 2, 3].map((n) => { const m = somaMeses(modo.mes, n); return <option key={m} value={m}>{rotuloMes(m)}</option>; })}
          </select>
        </Campo>
        <Campo rotulo="Dia de cobrança (1 a 28)"><input inputMode="numeric" value={dia} maxLength={2} onChange={(e) => setDia(e.target.value)} data-testid="plano-cli-dia" /></Campo>
        {troca && <p className="muted">O plano atual é encerrado e o novo começa sem mensalidade paga.</p>}
        <Rodape erro={erro} enviando={enviando} aoCancelar={aoCancelar} rotuloSalvar={troca ? 'Trocar plano' : 'Adicionar plano'} testid="plano-cli-salvar" />
      </form>
    </section>
  );
}
