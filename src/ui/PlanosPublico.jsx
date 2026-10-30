/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Página pública de planos (`#planos`): o cliente vê os planos e o valor mensal, pede um (entra para o dono aceitar) e consulta quantos atendimentos restam.
// Fala só com `publico.*`: nunca vê dado de outro cliente. A consulta de saldo responde só o número de atendimentos e é limitada por tentativas.
import React, { useState } from 'react';
import { publico } from '../services/api.js';
import { fmtMoney } from '../domain/time.js';
import { formatarTelefone } from '../domain/rules.js';
import { Aviso, Btn, Campo, Icon } from './common.jsx';
import { LogoMarca, RodapePlataforma } from './Marca.jsx';
import { useStore } from './hooks.js';

export default function PlanosPublico({ aoVoltar }) {
  const { state: st } = useStore();
  const lista = publico.planos().planos;
  const [pedir, setPedir] = useState(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [isca, setIsca] = useState('');
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState('');
  const [telSaldo, setTelSaldo] = useState('');
  const [saldo, setSaldo] = useState(null);

  const enviar = () => {
    const r = publico.pedirPlano({ nome: nome.trim(), telefone, planoId: pedir.id, site: isca });
    if (!r.ok) { setErro(r.erros[0]); return; }
    setErro(''); setEnviado(pedir.nome); setPedir(null); setNome(''); setTelefone('');
  };
  const consultar = () => {
    const r = publico.saldoDoPlano(telSaldo);
    if (!r.ok) { setSaldo({ erro: r.erros[0] }); return; }
    setSaldo(r);
  };
  return (
    <div className="pub" data-testid="pagina-planos">
      <header className="pub-topo"><div className="pub-marca"><LogoMarca comNome tamanho={72} /></div></header>
      <section className="pub-cartao" data-testid="planos-publicos">
        <h2>Planos</h2>
        <p className="muted">Escolha um plano mensal. O {st.estabelecimento.nome} confirma com você e combina o pagamento.</p>
        {!lista.length && <p className="muted" data-testid="planos-vazio">Nenhum plano à venda no momento.</p>}
        <div className="grade-cards">
          {lista.map((p) => (
            <article key={p.id} className="card-serv" data-testid={`pub-plano-${p.id}`}>
              <div className="card-serv-topo"><h3>{p.nome}</h3><b>{fmtMoney(p.preco)}<small className="muted">/mês</small></b></div>
              {p.descricao && <span className="muted">{p.descricao}</span>}
              <ul className="meta"><li><Icon n="scissors" size={14} /> {p.cortes} atendimento{p.cortes > 1 ? 's' : ''} por mês: {p.servicos.join(', ')}</li></ul>
              <Btn variante="primario" onClick={() => { setPedir(p); setEnviado(''); setErro(''); }} data-testid={`pub-quero-${p.id}`}>Quero este plano</Btn>
            </article>
          ))}
        </div>
        {enviado && <Aviso icone="check">Pedido enviado: plano {enviado}. Vamos falar com você para confirmar.</Aviso>}
        {pedir && (
          <div className="subcartao" data-testid="pub-pedido">
            <b>Plano {pedir.nome}</b>
            <Campo rotulo="Seu nome"><input value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} data-testid="pub-pedido-nome" /></Campo>
            <Campo rotulo="Seu telefone (com DDD)"><input inputMode="tel" value={telefone} onChange={(e) => setTelefone(formatarTelefone(e.target.value))} data-testid="pub-pedido-telefone" /></Campo>
            <input className="pub-isca" tabIndex={-1} aria-hidden="true" autoComplete="off" name="site" value={isca} onChange={(e) => setIsca(e.target.value)} data-testid="pub-pedido-isca" />
            {erro && <Aviso tipo="erro">{erro}</Aviso>}
            <div className="acoes"><Btn onClick={() => setPedir(null)}>Cancelar</Btn><Btn variante="primario" onClick={enviar} data-testid="pub-pedido-enviar">Enviar pedido</Btn></div>
          </div>
        )}
      </section>
      <section className="pub-cartao" data-testid="planos-saldo">
        <h2>Já tenho plano</h2>
        <p className="muted">Digite o telefone do cadastro para ver quantos atendimentos ainda restam neste mês.</p>
        <div className="linha-campos">
          <input inputMode="tel" value={telSaldo} onChange={(e) => setTelSaldo(formatarTelefone(e.target.value))} aria-label="Telefone" data-testid="pub-saldo-telefone" />
          <Btn onClick={consultar} data-testid="pub-saldo-consultar">Consultar</Btn>
        </div>
        {saldo?.erro && <Aviso tipo="erro">{saldo.erro}</Aviso>}
        {saldo && !saldo.erro && (saldo.planos.length
          ? <ul className="valores-lista" data-testid="pub-saldo-lista">{saldo.planos.map((p) => <li key={p.plano} className="v-linha"><span>{p.plano}</span><b data-testid="pub-saldo-restantes">{p.restantes} de {p.cortesPorMes}</b></li>)}</ul>
          : <p className="muted" data-testid="pub-saldo-nenhum">{saldo.aviso}</p>)}
      </section>
      {aoVoltar && <p><button type="button" className="link" onClick={aoVoltar} data-testid="pub-planos-voltar">Voltar</button></p>}
      <RodapePlataforma />
    </div>
  );
}
