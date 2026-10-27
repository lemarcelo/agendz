/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0a7714d744 */
import React, { useState } from 'react';
import { Avatar, Btn, Icon } from './common.jsx';
import { prepararFoto } from './imagem.js';

// Escolher a foto redonda de uma pessoa. A etiqueta envolve o seletor de arquivo (abre pelo navegador, sem depender de script, o que funciona melhor no celular).
// `onChange(foto | null)` recebe a imagem já reduzida (96 px, recortada no centro) ou null para remover.
export function FotoCampo({ valor, nome, chave, onChange, testid = 'foto' }) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const enviar = async (ev) => {
    const arq = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!arq) return;
    setOcupado(true); setErro('');
    try { onChange(await prepararFoto(arq)); } catch (e) { setErro(e.message); } finally { setOcupado(false); }
  };
  return (
    <div className="foto-campo" data-testid={`${testid}-campo`}>
      <span className="foto-previa"><Avatar nome={nome} foto={valor} chave={chave} className="avatar-grande" /></span>
      <div className="foto-acoes">
        <label className={`btn btn-neutro btn-sm${ocupado ? ' btn-desativado' : ''}`}>
          <Icon n="plus" size={15} />{ocupado ? 'Preparando…' : valor ? 'Trocar a foto' : 'Enviar uma foto'}
          <input type="file" accept="image/*" onChange={enviar} disabled={ocupado} className="entrada-oculta" data-testid={`${testid}-arquivo`} />
        </label>
        {valor && <Btn tamanho="sm" onClick={() => onChange(null)} data-testid={`${testid}-remover`}>Remover</Btn>}
        <small className="muted">Aparece redonda e pequena no calendário. Sem foto, vale a inicial com uma cor própria.</small>
        {erro && <small className="erro-txt" role="alert" data-testid={`${testid}-erro`}>{erro}</small>}
      </div>
    </div>
  );
}
