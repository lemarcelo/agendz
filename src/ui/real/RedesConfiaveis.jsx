/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// "Redes confiáveis" em Meu perfil (site real): as redes em que a PRÓPRIA pessoa pediu login automático. Remover derruba na hora o acesso longo daquela rede.
// O servidor identifica a rede pelo IP público (não vê o nome do Wi-Fi): quem muda de internet (4G, outro Wi-Fi) cai em "rede não reconhecida". Remover confirma na tela.
import React, { useEffect, useState } from 'react';
import { redes } from '../../services/api-real.js';
import { fmtDateTime } from '../../domain/time.js';
import { Aviso, Btn } from '../leve/mini.jsx';

const quando = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? fmtDateTime(t) : ''; };

export default function RedesConfiaveis() {
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [removendo, setRemovendo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    let vivo = true;
    redes.listar().then((r) => { if (vivo) setItens(r.ok ? r.itens : []); });
    return () => { vivo = false; };
  }, []);
  const remover = async (id) => {
    if (ocupado) return;
    setOcupado(true); setErro(''); setMsg('');
    const r = await redes.remover(id);
    setOcupado(false); setRemovendo('');
    if (!r.ok) { setErro(r.erro); return; }
    setItens((l) => (l || []).filter((x) => x.id !== id)); setMsg('Rede removida. Quem usava o acesso automático nela precisa entrar de novo.');
  };
  return (
    <section className="perfil-form-real perfil-redes-real" data-testid="perfil-redes">
      <h3>Redes confiáveis (login automático)</h3>
      <p className="muted perfil-nota-real">Nestas redes você entra direto e a sessão não vence. Em qualquer outra rede, o acesso dura 1 dia e depois pede a digital ou a senha. Para incluir uma rede, marque “Login automático” ao entrar nela.</p>
      {erro && <Aviso tipo="erro"><span data-testid="redes-erro">{erro}</span></Aviso>}
      {msg && <Aviso><span data-testid="redes-msg">{msg}</span></Aviso>}
      {itens && itens.length === 0 && <p className="muted" data-testid="redes-vazio">Nenhuma rede confiável.</p>}
      {itens && itens.length > 0 && (
        <ul className="digital-lista-real" data-testid="redes-lista">
          {itens.map((it) => (
            <li key={it.id} data-testid="redes-item">
              <span><b>{it.rotulo || 'Rede'}</b>{it.atual ? ' · esta rede' : ''} · incluída em {quando(it.criadoEm)}{it.ultimoUso ? ` · último uso ${quando(it.ultimoUso)}` : ''}</span>
              {removendo === it.id
                ? <span className="confirmar-linha"><Btn tamanho="sm" variante="perigo" disabled={ocupado} onClick={() => remover(it.id)} data-testid="redes-remover-sim">Sim, remover</Btn><Btn tamanho="sm" onClick={() => setRemovendo('')} data-testid="redes-remover-nao">Voltar</Btn></span>
                : <Btn tamanho="sm" disabled={ocupado} onClick={() => setRemovendo(it.id)} data-testid="redes-remover">Remover</Btn>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
