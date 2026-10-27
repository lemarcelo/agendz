/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:5fd9756363 */
import React, { useMemo, useRef, useState } from 'react';
import { estabelecimento as apiEst } from '../services/api.js';
import { LOGO_APEX } from '../tipos/estetica_automotiva/logo-apex.js';
import { LOGO_DALFORNO } from '../tipos/barbearia/logo-dalforno.js';
import { LOGO_OFFBOX } from '../tipos/barbearia/logo-offbox.js';
import { iconeMarcaAtivo } from '../domain/tipos.js';
import { LOGO_MAX, PALETAS, coresDoTema, coresDominantes, cssDaMarca, logoValida } from '../domain/tema.js';
import { Aviso, Btn, Icon } from './common.jsx';
import { toast, useStore } from './hooks.js';
import { LIMITE_FOTO_MB, abrirImagem } from './imagem.js';

// Assinatura da plataforma (o nome do app, não o da loja): aparece só no rodapé do login e da página do cliente.
export function RodapePlataforma() {
  return <p className="rodape-plataforma" data-testid="rodape-plataforma">Agendz</p>;
}

// Aplica as cores e o fundo da marca. O texto do <style> só tem cor #rrggbb e data URL já validados (cssDaMarca confere de novo).
export function TemaMarca() {
  const { state: st } = useStore();
  const css = useMemo(() => cssDaMarca(st.estabelecimento), [st.estabelecimento.logo, st.estabelecimento.corTema, st.estabelecimento.corTema2, st.estabelecimento.temaCor]);
  return css ? <style id="tema-marca" data-testid="tema-marca">{css}</style> : null;
}

// Marca no topo, no login e no link do cliente: a logo da loja (a enviada pelo dono ou a do seed) e, sem logo, o ícone do TIPO (tesoura, carro…).
// Nunca a logo de outra loja. O nome ao lado só aparece quando a logo não traz o nome escrito (as das lojas cadastradas trazem).
export function LogoMarca({ tamanho = 32, comNome = false }) {
  const { state: st } = useStore();
  const enviada = st.estabelecimento.logo;
  const nome = st.estabelecimento.nome || '';
  if (!logoValida(enviada)) {
    return <><span className="marca-icone" data-testid="marca-icone" style={tamanho !== 32 ? { width: tamanho, height: tamanho } : undefined}><Icon n={iconeMarcaAtivo()} size={Math.round(tamanho * 0.56)} /></span>{comNome && <b className="marca-nome">{nome}</b>}</>;
  }
  const daApex = [LOGO_APEX, LOGO_DALFORNO, LOGO_OFFBOX].includes(enviada); // logos que já trazem o nome da loja
  return <><img className="marca-logo" src={enviada} alt={daApex ? nome : ''} width={tamanho} height={tamanho} data-testid="logo-marca" />{comNome && !daApex && <b className="marca-nome">{nome}</b>}</>;
}

// Lê o arquivo, reduz para caber (até 384 px), acha as duas cores dominantes e devolve { logo, cores }.
// Foto de celular é grande (10 MB ou mais) e às vezes chega sem tipo informado: aceita qualquer imagem que o aparelho consiga abrir e
// sempre grava uma imagem nova (PNG, WebP ou JPEG) desenhada por nós, nunca o arquivo original.
async function prepararLogo(arquivo) {
  if (arquivo.type && !/^image\//.test(arquivo.type)) throw new Error('Escolha uma imagem (PNG, JPEG ou WebP).');
  if (arquivo.size > LIMITE_FOTO_MB * 1024 * 1024) throw new Error(`Imagem grande demais (máximo ${LIMITE_FOTO_MB} MB).`);
  const { img, fim } = await abrirImagem(arquivo);
  try {
    const nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height;
    if (!nw || !nh) throw new Error('Não consegui abrir essa imagem.');
    let lado = 384;
    for (let tentativa = 0; tentativa < 6; tentativa++) {
      const f = Math.min(1, lado / Math.max(nw, nh));
      const w = Math.max(1, Math.round(nw * f)), h = Math.max(1, Math.round(nh * f));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
      const candidatos = [c.toDataURL('image/png'), c.toDataURL('image/webp', 0.9), c.toDataURL('image/jpeg', 0.88)].filter((u) => /^data:image\/(png|webp|jpeg);base64,/.test(u) && logoValida(u));
      const melhor = candidatos.sort((a, b) => a.length - b.length)[0];
      if (melhor) {
        const p = document.createElement('canvas'); p.width = 48; p.height = 48;
        const px = p.getContext('2d'); px.drawImage(img, 0, 0, 48, 48);
        return { logo: melhor, cores: coresDominantes(px.getImageData(0, 0, 48, 48).data) };
      }
      lado = Math.round(lado * 0.7);
    }
    throw new Error(`Não consegui deixar a imagem abaixo de ${Math.round(LOGO_MAX / 1400)} KB. Tente uma imagem mais simples.`);
  } finally { fim(); }
}

export function PainelMarca() {
  const { state: st } = useStore();
  const e = st.estabelecimento;
  const entrada = useRef(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const tem = logoValida(e.logo);
  const temaAtual = e.temaCor || 'padrao';
  const logoComCor = tem && !!e.corTema;

  const enviar = async (ev) => {
    const arq = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!arq) return;
    setOcupado(true); setErro('');
    try {
      const { logo, cores } = await prepararLogo(arq);
      const r = apiEst.salvar({ logo, corTema: cores ? cores[0] : null, corTema2: cores ? cores[1] : null });
      if (r.ok) toast(cores ? 'Logo salva. Em "Cor do tema" dá para usar as cores dela.' : 'Logo salva. Ela não tem uma cor marcante, então "Cores da logo" fica indisponível.'); else toast(r.erros[0], 'erro');
    } catch (err) { setErro(err.message); toast(err.message, 'erro'); } finally { setOcupado(false); }
  };

  return (
    <div className="marca-painel" data-testid="painel-marca">
      <p>A logo aparece no topo, na tela de entrada e, bem suave, no fundo das telas onde sobra espaço (sem passar por trás de campos e textos). A cor do tema (degradê no topo e nos botões principais) se escolhe mais abaixo.</p>
      <div className="marca-previa">
        {tem ? <img src={e.logo} alt="Logo atual" data-testid="logo-previa" /> : <span className="marca-vazia"><Icon n={iconeMarcaAtivo()} size={34} /></span>}
        <div className="marca-acoes">
          {/* A etiqueta envolve o seletor: tocar nela abre os arquivos pelo próprio navegador, sem depender de script (alguns visualizadores de celular bloqueiam input.click()). */}
          <label className={`btn btn-primario${ocupado ? ' btn-desativado' : ''}`} data-testid="logo-enviar" aria-disabled={ocupado}>
            <Icon n="plus" size={17} />{ocupado ? 'Preparando…' : tem ? 'Trocar a logo' : 'Enviar a logo'}
            <input ref={entrada} type="file" accept="image/*" onChange={enviar} disabled={ocupado} className="entrada-oculta" data-testid="logo-arquivo" />
          </label>
          {tem && <Btn onClick={() => { const r = apiEst.salvar({ logo: null }); if (r.ok) toast('Logo removida.'); }} data-testid="logo-remover">Remover</Btn>}
          <small className="muted">PNG, JPEG ou WebP; pode ser foto do celular, o app reduz sozinho. Fundo transparente fica melhor.</small>
          {erro && <Aviso tipo="erro" icone="alert"><span data-testid="logo-erro">{erro}</span></Aviso>}
          <details className="marca-nativo"><summary>O botão não abriu seus arquivos?</summary><input type="file" accept="image/*" onChange={enviar} aria-label="Escolher a logo" data-testid="logo-arquivo-nativo" /></details>
        </div>
      </div>
      <div className="marca-cores" data-testid="cor-do-tema">
        <h3>Cor do tema</h3>
        <p className="muted">O degradê vai no topo (com o menu) e nos botões principais; fundo e cartões continuam neutros. O texto muda de cor sozinho para ficar legível, nos temas claro e escuro.</p>
        <div className="tema-opcoes" role="group" aria-label="Cor do tema">
          {[{ id: 'padrao', nome: 'Padrão', amostra: null }, { id: 'logo', nome: 'Cores da logo', amostra: logoComCor ? coresDoTema({ temaCor: 'logo', corTema: e.corTema, corTema2: e.corTema2 }) : null }, ...PALETAS.map((x) => ({ id: x.id, nome: x.nome, amostra: x.cores }))].map((o) => {
            const indisponivel = o.id === 'logo' && !logoComCor;
            return (
              <button key={o.id} type="button" className="tema-opcao" aria-pressed={temaAtual === o.id} disabled={indisponivel} data-testid={`tema-${o.id}`}
                onClick={() => { const r = apiEst.salvar({ temaCor: o.id }); if (!r.ok) toast(r.erros[0], 'erro'); }}>
                <span className="tema-amostra" style={o.amostra ? { background: `linear-gradient(100deg, ${o.amostra[0]}, ${o.amostra[1]})` } : undefined} />
                <b>{o.nome}</b>
                {indisponivel && <small>{tem ? 'A logo é só preto, branco ou cinza.' : 'Envie uma logo para usar.'}</small>}
                {o.id === 'padrao' && <small>Cores atuais</small>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
