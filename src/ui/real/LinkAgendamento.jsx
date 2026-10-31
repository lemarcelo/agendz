/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Link de agendamento do cliente no site real (5e-1), só do proprietário: mostra o endereço da página do cliente (#agendar), liga/desliga e escolhe até
// quantos dias à frente ele oferece horário. Quem decide é o servidor (GET/PUT /api/estabelecimento/link-agendamento); a tela mostra a mensagem dele.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs). Classes de CSS terminam em `-real`.
import React, { useEffect, useState } from 'react';
import { linkAgendamento as api } from '../../services/api-real.js';
import { capAtiva } from '../../domain/tipos.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';

export default function LinkAgendamento() {
  const [link, setLink] = useState(null);
  const [dias, setDias] = useState('30');
  const [limite, setLimite] = useState('3');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.obter().then((r) => { if (!vivo) return; if (r.ok) { setLink(r.link); setDias(String(r.link.diasMax)); setLimite(String(r.link.limiteAbertos)); } else setErro(r.erro); });
    return () => { vivo = false; };
  }, []);

  if (!link) return <section className="regras-real" data-testid="link-real">{erro ? <Aviso tipo="erro" data-testid="link-erro">{erro}</Aviso> : <p className="muted" role="status">Carregando…</p>}</section>;

  const endereco = `${globalThis.location ? globalThis.location.origin : ''}/#agendar`;
  const salvar = async (e) => {
    e.preventDefault();
    if (salvando) return;
    const n = Number(dias);
    if (!Number.isInteger(n) || n < 1 || n > 60) { setErro('Informe de 1 a 60 dias.'); return; }
    const lim = Number(limite);
    if (!Number.isInteger(lim) || lim < 1 || lim > 20) { setErro('Informe de 1 a 20 horários por cliente.'); return; }
    setSalvando(true); setErro(''); setOk('');
    const r = await api.gravar({ ativo: link.ativo, diasMax: n, limiteAbertos: lim, telefoneObrigatorio: link.telefoneObrigatorio, nomeObrigatorio: link.nomeObrigatorio, ...(capAtiva('usaVeiculo') ? { veiculoObrigatorio: link.veiculoObrigatorio } : {}) });
    setSalvando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setLink(r.link); setDias(String(r.link.diasMax)); setLimite(String(r.link.limiteAbertos)); setOk('Link salvo.');
  };
  const copiar = async () => {
    try { await globalThis.navigator.clipboard.writeText(endereco); setCopiado(true); } catch { setCopiado(false); } // sem permissão de copiar: o endereço continua na caixa para copiar à mão
  };
  return (
    <form className="regras-real" onSubmit={salvar} data-testid="link-real" aria-label="Link de agendamento do cliente">
      <h3>Link de agendamento do cliente</h3>
      <p className="muted">O cliente abre este endereço, vê só os horários livres e pede o dele. O pedido entra “a confirmar” na agenda.</p>
      {link.pendencias.length > 0 && (
        <Aviso tipo="erro" data-testid="link-pendencias">
          <b>O cliente não está vendo horários.</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{link.pendencias.map((x, i) => <li key={i} data-testid="link-pendencia">{x}</li>)}</ul>
        </Aviso>
      )}
      {!link.disponivel && <Aviso data-testid="link-indisponivel">O link não está disponível para esta loja no momento.</Aviso>}
      <Campo rotulo="Endereço da página do cliente"><input readOnly value={endereco} onFocus={(e) => e.target.select()} data-testid="link-endereco" /></Campo>
      <div className="acoes">
        <Btn onClick={copiar} data-testid="link-copiar"><Icone n="copy" size={15} /> {copiado ? 'Copiado' : 'Copiar link'}</Btn>
        <a className="btn btn-neutro" href="#agendar" target="_blank" rel="noopener noreferrer" data-testid="link-abrir">Abrir a página</a>
      </div>
      <label className="check-linha"><input type="checkbox" checked={link.ativo} onChange={(e) => { setOk(''); setErro(''); setLink({ ...link, ativo: e.target.checked }); }} data-testid="link-ativo" /><span>Link ligado</span></label>
      <label className="check-linha"><input type="checkbox" checked={link.telefoneObrigatorio} onChange={(e) => { setOk(''); setErro(''); setLink({ ...link, telefoneObrigatorio: e.target.checked }); }} data-testid="link-telefone-obrigatorio" /><span>Telefone obrigatório para pedir o horário</span></label>
      {!link.telefoneObrigatorio && <p className="muted" data-testid="link-telefone-aviso">Sem telefone o pedido fica sem cadastro (só o nome) e a loja não consegue avisar o cliente pelo WhatsApp.</p>}
      <label className="check-linha"><input type="checkbox" checked={link.nomeObrigatorio} onChange={(e) => { setOk(''); setErro(''); setLink({ ...link, nomeObrigatorio: e.target.checked }); }} data-testid="link-nome-obrigatorio" /><span>Nome obrigatório no link</span></label>
      {!link.nomeObrigatorio && <p className="muted" data-testid="link-nome-aviso">Sem nome e sem telefone o pedido fica anônimo na agenda.</p>}
      {capAtiva('usaVeiculo') && (
        <fieldset className="atender-real-bloco" data-testid="link-veiculo-obrigatorio">
          <legend>Dados do veículo obrigatórios no link</legend>
          {[['placa', 'Placa'], ['modelo', 'Modelo'], ['porte', 'Porte']].map(([k, r]) => (
            <label key={k} className="check-linha"><input type="checkbox" checked={link.veiculoObrigatorio.includes(k)} onChange={(e) => { setOk(''); setErro(''); setLink({ ...link, veiculoObrigatorio: e.target.checked ? [...link.veiculoObrigatorio, k] : link.veiculoObrigatorio.filter((x) => x !== k) }); }} data-testid={`link-veic-${k}`} /><span>{r}</span></label>
          ))}
          <small className="muted">Sem porte, vale o preço e a duração do porte médio.</small>
        </fieldset>
      )}
      <Campo rotulo="Oferecer horários até quantos dias à frente (1 a 60)"><input inputMode="numeric" value={dias} onChange={(e) => { setOk(''); setErro(''); setDias(e.target.value.replace(/\D/g, '').slice(0, 2)); }} maxLength={2} data-testid="link-dias" /></Campo>
      <Campo rotulo="Horários à frente que um mesmo cliente pode ter pelo link (1 a 20)" dica="Passou disso, o cliente recebe a mensagem de que já tem horários marcados."><input inputMode="numeric" value={limite} onChange={(e) => { setOk(''); setErro(''); setLimite(e.target.value.replace(/\D/g, '').slice(0, 2)); }} data-testid="link-limite" /></Campo>
      <p className="muted" data-testid="link-barrados">{link.barrados.total === 0 ? 'Nenhum pedido barrado nos últimos 30 dias.' : `Pedidos barrados nos últimos 30 dias: ${link.barrados.total}${[['limite_cliente', 'acima do limite'], ['frequencia', 'pedidos demais'], ['isca', 'robô'], ['rapido', 'rápido demais'], ['selo_invalido', 'selo falso']].filter(([k]) => link.barrados.porMotivo[k] > 0).map(([k, r]) => ` · ${r}: ${link.barrados.porMotivo[k]}`).join('')}.`} O registro não guarda nome, telefone nem IP.</p>
      {erro && <Aviso tipo="erro" data-testid="link-erro">{erro}</Aviso>}
      {ok && <p className="msg-ok" role="status" data-testid="link-ok">{ok}</p>}
      <div className="acoes"><Btn variante="primario" type="submit" disabled={salvando} data-testid="link-salvar">{salvando ? 'Salvando…' : 'Salvar link'}</Btn></div>
    </form>
  );
}
