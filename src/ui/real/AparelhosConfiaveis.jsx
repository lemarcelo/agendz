/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// "Aparelhos confiáveis" em Meu perfil (site real, v125): os aparelhos em que a PRÓPRIA pessoa pediu para continuar logada em qualquer rede. Remover derruba na hora o
// acesso daquele aparelho. Remover o aparelho em uso desconecta quem está usando (`aoRemoverEste` = sair). Remover confirma na tela (sem confirm do navegador).
import React, { useEffect, useState } from 'react';
import { aparelhos } from '../../services/api-real.js';
import { fmtDateTime } from '../../domain/time.js';
import { Aviso, Btn } from '../leve/mini.jsx';

const quando = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? fmtDateTime(t) : ''; };

export default function AparelhosConfiaveis({ aoRemoverEste }) {
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [removendo, setRemovendo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    let vivo = true;
    aparelhos.listar().then((r) => { if (vivo) setItens(r.ok ? r.itens : []); });
    return () => { vivo = false; };
  }, []);
  const remover = async (item) => {
    if (ocupado) return;
    setOcupado(true); setErro(''); setMsg('');
    const r = await aparelhos.remover(item.id);
    setOcupado(false); setRemovendo('');
    if (!r.ok) { setErro(r.erro); return; }
    setItens((l) => (l || []).filter((x) => x.id !== item.id));
    if (item.atual && typeof aoRemoverEste === 'function') { aoRemoverEste(); return; }
    setMsg('Aparelho removido. Quem o usava precisa entrar de novo.');
  };
  return (
    <section className="perfil-form-real perfil-aparelhos-real" data-testid="perfil-aparelhos">
      <h3>Aparelhos confiáveis (celular)</h3>
      <p className="muted perfil-nota-real">Nestes aparelhos você continua logado em qualquer rede, por até 1 ano de uso (sem uso por 90 dias, o acesso termina). Para incluir um aparelho, marque “Login automático” ao entrar nele e escolha “Só neste aparelho”. Perdeu o celular? Remova-o aqui, de outro lugar.</p>
      {erro && <Aviso tipo="erro"><span data-testid="aparelhos-erro">{erro}</span></Aviso>}
      {msg && <Aviso><span data-testid="aparelhos-msg">{msg}</span></Aviso>}
      {itens && itens.length === 0 && <p className="muted" data-testid="aparelhos-vazio">Nenhum aparelho confiável.</p>}
      {itens && itens.length > 0 && (
        <ul className="digital-lista-real" data-testid="aparelhos-lista">
          {itens.map((it) => (
            <li key={it.id} data-testid="aparelhos-item">
              <span><b>{it.rotulo || 'Aparelho'}</b>{it.atual ? ' · este aparelho' : ''} · incluído em {quando(it.criadoEm)}{it.ultimoUso ? ` · último uso ${quando(it.ultimoUso)}` : ''}</span>
              {removendo === it.id
                ? <span className="confirmar-linha">
                  {it.atual && <span className="muted" data-testid="aparelhos-aviso-atual">Você será desconectado agora.</span>}
                  <Btn tamanho="sm" variante="perigo" disabled={ocupado} onClick={() => remover(it)} data-testid="aparelhos-remover-sim">Sim, remover</Btn>
                  <Btn tamanho="sm" onClick={() => setRemovendo('')} data-testid="aparelhos-remover-nao">Voltar</Btn>
                </span>
                : <Btn tamanho="sm" disabled={ocupado} onClick={() => setRemovendo(it.id)} data-testid="aparelhos-remover">Remover</Btn>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
