/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// "Meu perfil" (site real): abre ao tocar na foto ou no nome no topo. Cada pessoa vê e muda os próprios dados (nome, apelido, e-mail, telefone, nascimento, foto)
// e troca a própria senha; perfil, permissões, CPF e comissão continuam sendo só do proprietário (o servidor ignora o que não é da lista).
// Também escolhe como quer ser avisada de agendamento novo: som (3 bipes sutis), faixa no topo e vibração; a escolha fica neste aparelho (`alerta.js`).
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs). Classes de CSS terminam em `-real`.
import React, { useEffect, useRef, useState } from 'react';
import { perfil as api, trocarSenha } from '../../services/api-real.js';
import Digital from './Digital.jsx';
import { fotoValida, FOTO_MAX } from '../../domain/foto.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';
import { gravarPrefs, tocarBipe, vibrar } from './alerta.js';

export const LADO_FOTO = 96;

// Reduz a imagem escolhida para um quadrado pequeno (corte central) em JPEG, abaixo do limite do servidor; arquivo que não é imagem volta com erro.
export async function prepararFoto(arquivo) {
  if (!arquivo || !/^image\/(png|jpeg|webp)$/.test(arquivo.type)) throw new Error('Escolha uma imagem PNG, JPEG ou WebP.');
  if (arquivo.size > 8 * 1024 * 1024) throw new Error('A imagem é grande demais (máximo 8 MB).');
  let img;
  try { img = await createImageBitmap(arquivo); } catch { throw new Error('Não consegui abrir essa imagem. Tente outra.'); }
  const lado = Math.min(img.width, img.height);
  const c = globalThis.document.createElement('canvas');
  c.width = LADO_FOTO; c.height = LADO_FOTO;
  c.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, LADO_FOTO, LADO_FOTO);
  for (const q of [0.82, 0.65, 0.5]) {
    const url = c.toDataURL('image/jpeg', q);
    if (url.length <= FOTO_MAX && fotoValida(url)) return url;
  }
  throw new Error('Não consegui reduzir essa imagem. Tente outra.');
}

export function AvatarReal({ nome, foto, chave, tamanho = 30 }) {
  const inicial = String(nome || '?').trim().charAt(0).toUpperCase() || '?';
  if (fotoValida(foto)) return <img className="avatar avatar-foto" src={foto} alt="" width={tamanho} height={tamanho} draggable={false} data-testid="perfil-avatar-foto" />;
  let h = 0; for (const ch of String(chave || nome || '?')) h = (h * 31 + ch.codePointAt(0)) % 360;
  return <span className="avatar avatar-inicial" style={{ background: `hsl(${h} 55% 34%)`, width: tamanho, height: tamanho }} data-testid="perfil-avatar-inicial">{inicial}</span>;
}

const OPCOES = [
  ['som', 'Som', 'Três bipes bem baixos quando entra um agendamento ou o cliente mexe num horário.'],
  ['aviso', 'Faixa no topo', 'Um aviso na tela; tocar nele abre o agendamento na agenda.'],
  ['vibracao', 'Vibração', 'Só em aparelhos que vibram (celular). No computador não faz nada.'],
];

export default function MeuPerfil({ loja, sessao, dados, prefs, aoPrefs, aoMudou, aoFechar }) {
  const [f, setF] = useState(() => ({ nome: dados?.nome || '', apelido: dados?.apelido || '', email: dados?.email || '', telefone: dados?.telefone || '', nascimento: dados?.nascimento || '' }));
  const [carregado, setCarregado] = useState(!!dados);
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [senha, setSenha] = useState({ atual: '', nova: '', repetir: '' });
  const [msgSenha, setMsgSenha] = useState('');
  const [erroSenha, setErroSenha] = useState('');
  const [trocando, setTrocando] = useState(false);
  const caixa = useRef(null);

  useEffect(() => {
    let vivo = true;
    api.obter().then((r) => {
      if (!vivo) return;
      if (!r.ok) { setErro(r.erro); setCarregado(true); return; }
      setF({ nome: r.dados.nome, apelido: r.dados.apelido, email: r.dados.email, telefone: r.dados.telefone, nascimento: r.dados.nascimento });
      aoMudou(r.dados); setCarregado(true);
    });
    return () => { vivo = false; };
  }, []);
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') aoFechar(); };
    globalThis.document.addEventListener('keydown', tecla);
    caixa.current?.focus();
    return () => globalThis.document.removeEventListener('keydown', tecla);
  }, []);

  const mudar = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setMsg(''); };
  const salvar = async (e) => {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true); setErro(''); setMsg('');
    const r = await api.salvar(f);
    setSalvando(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoMudou(r.dados); setMsg('Dados salvos.');
  };
  const trocarFoto = async (e) => {
    const arq = e.target.files && e.target.files[0]; e.target.value = '';
    if (!arq) return;
    setErro(''); setMsg('');
    try {
      const url = await prepararFoto(arq);
      const r = await api.foto(url);
      if (!r.ok) { setErro(r.erro); return; }
      aoMudou({ ...(dados || {}), foto: url }); setMsg('Foto atualizada.');
    } catch (x) { setErro(x.message || 'Não consegui usar essa imagem.'); }
  };
  const tirarFoto = async () => {
    setErro(''); setMsg('');
    const r = await api.foto('');
    if (!r.ok) { setErro(r.erro); return; }
    aoMudou({ ...(dados || {}), foto: null }); setMsg('Foto removida.');
  };
  const marcar = (k) => (e) => aoPrefs(gravarPrefs(loja.slug, sessao.id, { ...prefs, [k]: e.target.checked }));
  const testar = () => {
    if (prefs.som) tocarBipe();
    if (prefs.vibracao) vibrar();
  };
  const trocar = async (e) => {
    e.preventDefault();
    if (trocando) return;
    setErroSenha(''); setMsgSenha('');
    if (senha.nova !== senha.repetir) { setErroSenha('A confirmação não é igual à nova senha.'); return; }
    setTrocando(true);
    const r = await trocarSenha({ senhaAtual: senha.atual, nova: senha.nova });
    setTrocando(false);
    if (!r.ok) { setErroSenha(r.erro); return; }
    setSenha({ atual: '', nova: '', repetir: '' }); setMsgSenha('Senha trocada.');
  };

  return (
    <div className="perfil-fundo-real" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }} data-testid="perfil-fundo">
      <div className="perfil-real" role="dialog" aria-modal="true" aria-label="Meu perfil" tabIndex={-1} ref={caixa} data-testid="meu-perfil">
        <div className="perfil-topo-real">
          <h2>Meu perfil</h2>
          <button type="button" className="icone-btn" onClick={aoFechar} aria-label="Fechar" data-testid="perfil-fechar"><Icone n="x" size={18} /></button>
        </div>
        <div className="perfil-foto-real">
          <AvatarReal nome={dados?.apelido || dados?.nome || sessao.nome} foto={dados?.foto} chave={sessao.id} tamanho={64} />
          <div className="perfil-foto-botoes-real">
            <label className="btn btn-neutro btn-sm" data-testid="perfil-foto-escolher"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={trocarFoto} data-testid="perfil-foto-arquivo" hidden />Trocar foto</label>
            {dados?.foto && <Btn tamanho="sm" onClick={tirarFoto} data-testid="perfil-foto-tirar">Tirar foto</Btn>}
          </div>
        </div>
        {erro && <Aviso tipo="erro"><span data-testid="perfil-erro">{erro}</span></Aviso>}
        {msg && <Aviso><span data-testid="perfil-msg">{msg}</span></Aviso>}
        {!carregado ? <p className="muted" role="status">Carregando…</p> : (
          <form onSubmit={salvar} className="perfil-form-real" data-testid="perfil-form">
            <p className="muted perfil-usuario-real">Usuário para entrar: <b data-testid="perfil-usuario">{dados?.usuario || '—'}</b></p>
            <Campo rotulo="Nome completo"><input value={f.nome} maxLength={150} onChange={mudar('nome')} data-testid="perfil-nome" /></Campo>
            <Campo rotulo="Apelido (como aparece na agenda)"><input value={f.apelido} maxLength={60} onChange={mudar('apelido')} data-testid="perfil-apelido" /></Campo>
            <Campo rotulo="E-mail"><input type="email" value={f.email} maxLength={150} autoComplete="email" onChange={mudar('email')} data-testid="perfil-email" /></Campo>
            <Campo rotulo="Telefone"><input type="tel" value={f.telefone} maxLength={20} autoComplete="tel" onChange={mudar('telefone')} data-testid="perfil-telefone" /></Campo>
            <Campo rotulo="Nascimento"><input type="date" value={f.nascimento} onChange={mudar('nascimento')} data-testid="perfil-nascimento" /></Campo>
            <Btn variante="primario" type="submit" disabled={salvando} data-testid="perfil-salvar">{salvando ? 'Salvando…' : 'Salvar dados'}</Btn>
          </form>
        )}
        <fieldset className="perfil-avisos-real" data-testid="perfil-avisos">
          <legend>Aviso de agendamento novo</legend>
          {OPCOES.map(([k, rotulo, ajuda]) => (
            <label key={k} className="perfil-opcao-real">
              <input type="checkbox" checked={prefs[k]} onChange={marcar(k)} data-testid={`perfil-aviso-${k}`} />
              <span><b>{rotulo}</b><small className="muted">{ajuda}</small></span>
            </label>
          ))}
          <Btn tamanho="sm" onClick={testar} disabled={!prefs.som && !prefs.vibracao} data-testid="perfil-aviso-testar">Testar som e vibração</Btn>
          <p className="muted perfil-nota-real">Vale só neste aparelho. O navegador só libera o som depois que você toca na página.</p>
        </fieldset>
        <form onSubmit={trocar} className="perfil-form-real perfil-senha-real" data-testid="perfil-senha-form">
          <h3>Trocar senha</h3>
          {erroSenha && <Aviso tipo="erro"><span data-testid="perfil-senha-erro">{erroSenha}</span></Aviso>}
          {msgSenha && <Aviso><span data-testid="perfil-senha-msg">{msgSenha}</span></Aviso>}
          <Campo rotulo="Senha atual"><input type="password" value={senha.atual} maxLength={100} autoComplete="current-password" onChange={(e) => setSenha({ ...senha, atual: e.target.value })} data-testid="perfil-senha-atual" /></Campo>
          <Campo rotulo="Nova senha (mínimo 8 caracteres)"><input type="password" value={senha.nova} maxLength={100} autoComplete="new-password" onChange={(e) => setSenha({ ...senha, nova: e.target.value })} data-testid="perfil-senha-nova" /></Campo>
          <Campo rotulo="Repita a nova senha"><input type="password" value={senha.repetir} maxLength={100} autoComplete="new-password" onChange={(e) => setSenha({ ...senha, repetir: e.target.value })} data-testid="perfil-senha-repetir" /></Campo>
          <Btn type="submit" disabled={trocando || !senha.atual || !senha.nova} data-testid="perfil-senha-trocar">{trocando ? 'Trocando…' : 'Trocar senha'}</Btn>
        </form>
        <Digital />
      </div>
    </div>
  );
}
