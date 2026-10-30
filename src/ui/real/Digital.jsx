/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// "Entrar com a digital" em Meu perfil (site real): cadastra, lista e remove os aparelhos da PRÓPRIA pessoa. A senha continua valendo; cadastrar pede a senha de novo.
// Remover confirma na própria tela (nada de confirm()). Quem não tem suporte no navegador vê só o aviso.
import React, { useEffect, useState } from 'react';
import { passkey } from '../../services/api-real.js';
import { fmtDateTime } from '../../domain/time.js';
import { Aviso, Btn, Campo } from '../leve/mini.jsx';

const quando = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? fmtDateTime(t) : ''; };

export default function Digital() {
  const suporta = passkey.disponivel();
  const [itens, setItens] = useState(null);
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [removendo, setRemovendo] = useState('');
  useEffect(() => {
    let vivo = true;
    if (suporta) passkey.listar().then((r) => { if (vivo) { if (r.ok) setItens(r.itens); else setItens([]); } });
    return () => { vivo = false; };
  }, [suporta]);

  const cadastrar = async (e) => {
    e.preventDefault();
    if (ocupado) return;
    setOcupado(true); setErro(''); setMsg('');
    const r = await passkey.cadastrar({ senha, nome });
    setOcupado(false);
    setSenha('');
    if (!r.ok) { setErro(r.erro); return; }
    setItens((l) => [...(l || []), r.item]); setNome(''); setMsg('Aparelho cadastrado. Na tela de entrada, use "Entrar com a digital".');
  };
  const remover = async (id) => {
    if (ocupado) return;
    setOcupado(true); setErro(''); setMsg('');
    const r = await passkey.remover(id);
    setOcupado(false); setRemovendo('');
    if (!r.ok) { setErro(r.erro); return; }
    setItens((l) => (l || []).filter((x) => x.id !== id)); setMsg('Aparelho removido.');
  };

  return (
    <form onSubmit={cadastrar} className="perfil-form-real perfil-digital-real" data-testid="perfil-digital">
      <h3>Entrar com a digital</h3>
      <p className="muted perfil-nota-real">Entre sem digitar a senha, usando a digital, o rosto ou o PIN deste aparelho. A senha continua funcionando.</p>
      {!suporta && <Aviso data-testid="digital-indisponivel">Este navegador (ou este endereço) não permite entrar com a digital.</Aviso>}
      {erro && <Aviso tipo="erro"><span data-testid="digital-erro">{erro}</span></Aviso>}
      {msg && <Aviso><span data-testid="digital-msg">{msg}</span></Aviso>}
      {suporta && itens && itens.length > 0 && (
        <ul className="digital-lista-real" data-testid="digital-lista">
          {itens.map((it) => (
            <li key={it.id} data-testid="digital-item">
              <span><b>{it.nome}</b> · cadastrado em {quando(it.criadoEm)}{it.ultimoUso ? ` · usado em ${quando(it.ultimoUso)}` : ' · nunca usado'}</span>
              {removendo === it.id
                ? <span className="confirmar-linha"><Btn tamanho="sm" variante="perigo" disabled={ocupado} onClick={() => remover(it.id)} data-testid="digital-remover-sim">Sim, remover</Btn><Btn tamanho="sm" onClick={() => setRemovendo('')} data-testid="digital-remover-nao">Voltar</Btn></span>
                : <Btn tamanho="sm" disabled={ocupado} onClick={() => setRemovendo(it.id)} data-testid="digital-remover">Remover</Btn>}
            </li>
          ))}
        </ul>
      )}
      {suporta && (
        <>
          <Campo rotulo="Nome deste aparelho (opcional)"><input value={nome} maxLength={60} placeholder="Celular, notebook…" onChange={(e) => setNome(e.target.value)} data-testid="digital-nome" /></Campo>
          <Campo rotulo="Sua senha (para confirmar)"><input type="password" value={senha} maxLength={100} autoComplete="current-password" onChange={(e) => { setSenha(e.target.value); setErro(''); }} data-testid="digital-senha" /></Campo>
          <Btn type="submit" disabled={ocupado || !senha} data-testid="digital-cadastrar">{ocupado ? 'Aguardando o aparelho…' : 'Cadastrar este aparelho'}</Btn>
        </>
      )}
    </form>
  );
}
