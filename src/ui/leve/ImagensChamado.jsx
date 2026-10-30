/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Imagens do chamado de suporte, nas duas telas (Artifact e site real): escolher até 3 antes de enviar e mostrar as que vieram na conversa. Sem URL pública:
// a imagem é pedida ao adaptador (com login) e vira um endereço local (blob) só nesta tela. Texto e nomes entram só como texto.
import React, { useEffect, useRef, useState } from 'react';
import { MAX_IMAGENS } from '../../domain/imagem-chamado.js';
import { Aviso, Btn, Icone } from './mini.jsx';
import { prepararImagemChamado } from './imagem-chamado.js';

// Escolha antes de enviar. `valor`: [{ id, dados, previa }]; `aoMudar` recebe a lista nova.
export function EscolherImagens({ valor, aoMudar, desabilitado }) {
  const [erro, setErro] = useState('');
  const [lendo, setLendo] = useState(false);
  const entrada = useRef(null);
  const escolher = async (e) => {
    const arquivos = Array.from(e.target.files || []); e.target.value = '';
    if (!arquivos.length) return;
    setErro('');
    if (valor.length + arquivos.length > MAX_IMAGENS) { setErro(`Até ${MAX_IMAGENS} imagens por mensagem.`); return; }
    setLendo(true);
    try {
      const novas = [];
      for (const a of arquivos) { const p = await prepararImagemChamado(a); novas.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...p }); }
      aoMudar([...valor, ...novas]);
    } catch (x) { setErro(x.message || 'Não consegui usar essa imagem.'); }
    setLendo(false);
  };
  return (
    <div className="sup-imagens" data-testid="sup-imagens">
      {valor.length > 0 && (
        <ul className="sup-previas">
          {valor.map((im, i) => (
            <li key={im.id} data-testid="sup-previa">
              <img src={im.previa} alt={`Imagem ${i + 1} para enviar`} width={64} height={64} />
              <button type="button" className="icone-btn" aria-label={`Tirar a imagem ${i + 1}`} onClick={() => aoMudar(valor.filter((x) => x.id !== im.id))} data-testid="sup-previa-tirar"><Icone n="x" size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={escolher} data-testid="sup-imagem-arquivo" />
      <Btn tamanho="sm" disabled={desabilitado || lendo || valor.length >= MAX_IMAGENS} onClick={() => entrada.current && entrada.current.click()} data-testid="sup-imagem-escolher">{lendo ? 'Preparando…' : valor.length ? 'Juntar outra imagem' : 'Juntar imagem'}</Btn>
      <span className="muted sup-dica">PNG, JPEG ou WebP · até {MAX_IMAGENS} por mensagem</span>
      {erro && <Aviso tipo="erro"><span data-testid="sup-imagem-erro">{erro}</span></Aviso>}
    </div>
  );
}

// Uma imagem que veio na conversa. Carrega sob demanda pelo adaptador; clicar alterna entre miniatura e tamanho grande.
function Uma({ chamadoId, anexo, adaptador }) {
  const [url, setUrl] = useState('');
  const [falhou, setFalhou] = useState(false);
  const [grande, setGrande] = useState(false);
  useEffect(() => {
    let vivo = true; let feita = '';
    if (adaptador.imagem) {
      adaptador.imagem(chamadoId, anexo.id).then((r) => {
        if (!vivo) { if (r.ok && r.url && r.url.startsWith('blob:')) globalThis.URL.revokeObjectURL(r.url); return; }
        if (r.ok && r.url) { feita = r.url; setUrl(r.url); } else setFalhou(true);
      });
    } else setFalhou(true);
    return () => { vivo = false; if (feita.startsWith('blob:')) globalThis.URL.revokeObjectURL(feita); };
  }, [chamadoId, anexo.id, adaptador]);
  if (falhou) return <span className="muted sup-img-falha" data-testid="sup-img-falha">Não foi possível carregar a imagem.</span>;
  if (!url) return <span className="muted sup-img-carregando" role="status">Carregando imagem…</span>;
  return (
    <button type="button" className={`sup-img ${grande ? 'grande' : ''}`} onClick={() => setGrande(!grande)} aria-label={grande ? 'Reduzir imagem' : 'Ampliar imagem'} data-testid="sup-img">
      <img src={url} alt="Imagem anexada ao chamado" />
    </button>
  );
}

export function ImagensDaMensagem({ chamadoId, anexos, adaptador }) {
  if (!anexos || !anexos.length) return null;
  return <span className="sup-anexos" data-testid="sup-anexos">{anexos.map((a) => <Uma key={a.id} chamadoId={chamadoId} anexo={a} adaptador={adaptador} />)}</span>;
}
