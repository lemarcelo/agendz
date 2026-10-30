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
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.obter().then((r) => { if (!vivo) return; if (r.ok) { setLink(r.link); setDias(String(r.link.diasMax)); } else setErro(r.erro); });
    return () => { vivo = false; };
  }, []);

  if (!link) return <section className="regras-real" data-testid="link-real">{erro ? <Aviso tipo="erro" data-testid="link-erro">{erro}</Aviso> : <p className="muted" role="status">Carregando…</p>}</section>;

  const endereco = `${globalThis.location ? globalThis.location.origin : ''}/#agendar`;
  const salvar = async (e) => {
    e.preventDefault();
    if (salvando) return;
    const n = Number(dias);
    if (!Number.isInteger(n) || n < 1 || n > 60) { setErro('Informe de 1 a 60 dias.'); return; }
    setSalvando(true); setErro(''); setOk('');
    const r = await api.gravar({ ativo: link.ativo, diasMax: n, telefoneObrigatorio: link.telefoneObrigatorio, nomeObrigatorio: link.nomeObrigatorio, ...(capAtiva('usaVeiculo') ? { veiculoObrigatorio: link.veiculoObrigatorio } : {}) });
    setSalvando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setLink(r.link); setDias(String(r.link.diasMax)); setOk('Link salvo.');
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
      {erro && <Aviso tipo="erro" data-testid="link-erro">{erro}</Aviso>}
      {ok && <p className="msg-ok" role="status" data-testid="link-ok">{ok}</p>}
      <div className="acoes"><Btn variante="primario" type="submit" disabled={salvando} data-testid="link-salvar">{salvando ? 'Salvando…' : 'Salvar link'}</Btn></div>
    </form>
  );
}
