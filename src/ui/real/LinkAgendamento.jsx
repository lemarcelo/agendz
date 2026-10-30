/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Link de agendamento do cliente no site real (5e-1), só do proprietário: mostra o endereço da página do cliente (#agendar), liga/desliga e escolhe até
// quantos dias à frente ele oferece horário. Quem decide é o servidor (GET/PUT /api/estabelecimento/link-agendamento); a tela mostra a mensagem dele.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs). Classes de CSS terminam em `-real`.
import React, { useEffect, useState } from 'react';
import { linkAgendamento as api } from '../../services/api-real.js';
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
    const r = await api.gravar({ ativo: link.ativo, diasMax: n, telefoneObrigatorio: link.telefoneObrigatorio });
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
      {!link.disponivel && <Aviso data-testid="link-indisponivel">O link não está disponível para esta loja no momento.</Aviso>}
      <Campo rotulo="Endereço da página do cliente"><input readOnly value={endereco} onFocus={(e) => e.target.select()} data-testid="link-endereco" /></Campo>
      <div className="acoes">
        <Btn onClick={copiar} data-testid="link-copiar"><Icone n="copy" size={15} /> {copiado ? 'Copiado' : 'Copiar link'}</Btn>
        <a className="btn btn-neutro" href="#agendar" target="_blank" rel="noopener noreferrer" data-testid="link-abrir">Abrir a página</a>
      </div>
      <label className="check-linha"><input type="checkbox" checked={link.ativo} onChange={(e) => { setOk(''); setErro(''); setLink({ ...link, ativo: e.target.checked }); }} data-testid="link-ativo" /><span>Link ligado</span></label>
      <label className="check-linha"><input type="checkbox" checked={link.telefoneObrigatorio} onChange={(e) => { setOk(''); setErro(''); setLink({ ...link, telefoneObrigatorio: e.target.checked }); }} data-testid="link-telefone-obrigatorio" /><span>Telefone obrigatório para pedir o horário</span></label>
      {!link.telefoneObrigatorio && <p className="muted" data-testid="link-telefone-aviso">Sem telefone o pedido fica sem cadastro (só o nome) e a loja não consegue avisar o cliente pelo WhatsApp.</p>}
      <Campo rotulo="Oferecer horários até quantos dias à frente (1 a 60)"><input inputMode="numeric" value={dias} onChange={(e) => { setOk(''); setErro(''); setDias(e.target.value.replace(/\D/g, '').slice(0, 2)); }} maxLength={2} data-testid="link-dias" /></Campo>
      {erro && <Aviso tipo="erro" data-testid="link-erro">{erro}</Aviso>}
      {ok && <p className="msg-ok" role="status" data-testid="link-ok">{ok}</p>}
      <div className="acoes"><Btn variante="primario" type="submit" disabled={salvando} data-testid="link-salvar">{salvando ? 'Salvando…' : 'Salvar link'}</Btn></div>
    </form>
  );
}
