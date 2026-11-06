/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// WhatsApp do estabelecimento (V60), em Estabelecimento > Dados do site real: o destino do botão "Combinar agendamento" do link do cliente quando o serviço não tem ninguém
// com telefone para combinar o horário, e o da troca de plano quando o dela está vazio. Toda a regra (55 + DDD + número) está no servidor (WhatsappDaLoja).
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import React, { useEffect, useState } from 'react';
import { whatsappLoja as api } from '../../services/api-real.js';
import { Aviso, Btn, Campo } from '../leve/mini.jsx';

const nacional = (n) => String(n || '').replace(/^55/, '');
const mascara = (n) => { const d = nacional(n).replace(/\D/g, '').slice(0, 11); return d.length <= 2 ? d : d.length <= 6 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : d.length <= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; };

export default function WhatsappLoja() {
  const [valor, setValor] = useState(null); // null = carregando
  const [erro, setErro] = useState('');
  const [salvo, setSalvo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await api.obter();
      if (!vivo) return;
      if (!r.ok) { setErro(r.erro); setValor(''); return; }
      setValor(mascara(r.whatsapp));
    })();
    return () => { vivo = false; };
  }, []);
  const salvar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true); setErro(''); setSalvo(false);
    const r = await api.salvar(valor);
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setValor(mascara(r.whatsapp)); setSalvo(true);
  };
  if (valor === null) return <p className="muted" role="status" data-testid="est-whatsapp-carregando">Carregando…</p>;
  return (
    <form onSubmit={salvar} className="form-grade" data-testid="est-whatsapp-form">
      <Campo rotulo="WhatsApp do estabelecimento" dica="Com DDD. É para onde vai o cliente que toca em Combinar agendamento quando o serviço não tem ninguém com telefone para combinar o horário. Em branco, o botão abre o WhatsApp sem contato.">
        <input value={valor} inputMode="tel" autoComplete="off" maxLength={20} onChange={(e) => { setValor(mascara(e.target.value)); setSalvo(false); }} data-testid="est-whatsapp" />
      </Campo>
      {erro && <Aviso tipo="erro" data-testid="est-whatsapp-erro">{erro}</Aviso>}
      {salvo && <Aviso data-testid="est-whatsapp-salvo"><span role="status">WhatsApp salvo.</span></Aviso>}
      <div className="acoes"><Btn variante="primario" type="submit" disabled={enviando} data-testid="est-whatsapp-salvar">{enviando ? 'Salvando…' : 'Salvar WhatsApp'}</Btn></div>
    </form>
  );
}
