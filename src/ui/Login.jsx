/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:971a54477a */
import React, { useState } from 'react';
import { MODO_DEMO, LOJA_TROCAVEL, auth, store } from '../services/api.js';
import { chat } from '../services/chat.js';
import { TIPOS } from '../domain/tipos.js';
import { LOJAS_DEMO } from '../services/lojas-demo.js';
import { Aviso, Btn, Campo, Icon, Modal } from './common.jsx';
import { formatarCpf, formatarTelefone } from '../domain/rules.js';
import { toast, useStore } from './hooks.js';
import { LogoMarca, RodapePlataforma } from './Marca.jsx';
import { marcar } from '../domain/autoria.js';

function Recuperar({ onClose }) {
  const [passo, setPasso] = useState(1);
  const [f, setF] = useState({ cpf: '', telefone: '', canal: 'whatsapp', codigo: '', senha: '' });
  const [erro, setErro] = useState('');
  const [sim, setSim] = useState(null);
  const enviar = () => {
    const r = auth.iniciarRecuperacao(f);
    if (!r.ok) { setErro(r.erros[0]); return; }
    setErro(''); setSim(r); setPasso(2);
  };
  const concluir = () => {
    const r = auth.concluirRecuperacao(f);
    if (!r.ok) { setErro(r.erros[0]); return; }
    toast('Senha alterada. Entre com a nova senha.'); onClose();
  };
  return (
    <Modal titulo="Recuperar senha" onClose={onClose} largura={460}
      rodape={passo === 1 ? <><Btn onClick={onClose}>Cancelar</Btn><Btn variante="primario" onClick={enviar} data-testid="rec-enviar">Enviar código</Btn></> : <><Btn onClick={() => setPasso(1)}>Voltar</Btn><Btn variante="primario" onClick={concluir} data-testid="rec-concluir">Salvar nova senha</Btn></>}>
      {passo === 1 ? (
        <div className="form-grade um">
          <Campo rotulo="CPF"><input value={f.cpf} inputMode="numeric" onChange={(e) => setF({ ...f, cpf: formatarCpf(e.target.value) })} data-testid="rec-cpf" /></Campo>
          <Campo rotulo="Telefone cadastrado"><input value={f.telefone} inputMode="tel" onChange={(e) => setF({ ...f, telefone: formatarTelefone(e.target.value) })} data-testid="rec-tel" /></Campo>
          <Campo rotulo="Enviar o código por">
            <select value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })}><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option></select>
          </Campo>
        </div>
      ) : (
        <div className="form-grade um">
          <Aviso icone="msg"><b>Simulação:</b> mensagem enviada para {sim.destino}: “Seu código de recuperação é <b data-testid="rec-codigo">{sim.codigo}</b>.”</Aviso>
          <Campo rotulo="Código recebido"><input value={f.codigo} inputMode="numeric" onChange={(e) => setF({ ...f, codigo: e.target.value })} data-testid="rec-cod-in" /></Campo>
          <Campo rotulo="Nova senha"><input type="password" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} autoComplete="new-password" data-testid="rec-nova" /></Campo>
        </div>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Modal>
  );
}

export default function Login() {
  const { state: st, loja } = useStore();
  const [id, setId] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [rec, setRec] = useState(false);
  const entrar = (e) => {
    e && e.preventDefault();
    const r = auth.login({ identificador: id, senha });
    if (!r.ok) setErro(r.erros[0]);
  };
  const rapido = (u) => { const r = auth.login({ identificador: u.apelido, senha: u.senha }); if (!r.ok) setErro(r.erros[0]); };
  return (
    <main className="login">
      <div className="login-cartao">
        <div className="login-marca"><LogoMarca tamanho={56} /><div><h1>{st.estabelecimento.nome}</h1><p className="muted">{marcar('Painel de agendamentos')}</p></div></div>
        <form onSubmit={entrar} className="form-grade um">
          <Campo rotulo="CPF, apelido ou e-mail"><input value={id} onChange={(e) => { setId(e.target.value); setErro(''); }} autoComplete="username" autoFocus data-testid="login-id" /></Campo>
          <Campo rotulo="Senha"><input type="password" value={senha} onChange={(e) => { setSenha(e.target.value); setErro(''); }} autoComplete="current-password" data-testid="login-senha" /></Campo>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <Btn variante="primario" type="submit" data-testid="login-entrar">Entrar</Btn>
          <button type="button" className="link" onClick={() => setRec(true)} data-testid="esqueci">Esqueci minha senha</button>
        </form>
        <div className="login-demo">
          {MODO_DEMO && LOJA_TROCAVEL && (
            <div className="demo-tipos" role="group" aria-label="Loja da demonstração" data-testid="demo-tipos">
              <p className="muted"><b>Demonstração:</b> escolha a loja. Em produção ela vem do endereço (DNS) usado.</p>
              <div className="acoes">
                {LOJAS_DEMO.map((l) => <Btn key={l.slug} tamanho="sm" variante={loja === l.slug ? 'primario' : undefined} aria-pressed={loja === l.slug} onClick={() => { if (loja !== l.slug) { store.entrarNaLoja(l.slug); chat.reiniciar(); } }} data-testid={`demo-loja-${l.slug}`} title={TIPOS[l.tipo].nome}>{l.nome}</Btn>)}
              </div>
            </div>
          )}
          {MODO_DEMO && (
            <label className="servico-op" data-testid="sim-admin">
              <input type="checkbox" checked={st.regrasPlataforma?.avaliacaoMostraAnonimo === true} onChange={(e) => store.simularAdmin('avaliacaoMostraAnonimo', e.target.checked, 'Simulação do Admin na demonstração')} data-testid="sim-admin-anonimo" />
              <span><b>Simular o Admin: mostrar quem avalia como anônimo</b><small className="muted">Na plataforma só o Admin muda isto, com motivo. A loja nunca escolhe.</small></span>
            </label>
          )}
          <p className="muted"><a href="#primeiro-acesso" data-testid="ver-primeiro-acesso">Ver o assistente de primeiro acesso</a> (pré-visualização, nada é gravado)</p>
          <p className="muted"><b>Para testar</b> (senha de todos: 1234)</p>
          <div className="acoes">
            {st.usuarios.map((u) => <Btn key={u.id} tamanho="sm" onClick={() => rapido(u)} data-testid={`demo-${u.apelido.toLowerCase()}`}>{u.apelido}{u.papel === 'dono' && u.apelido.toLowerCase() !== 'proprietário' ? ' (proprietário)' : ''}</Btn>)}
          </div>
        </div>
      </div>
      <RodapePlataforma />
      {rec && <Recuperar onClose={() => setRec(false)} />}
    </main>
  );
}
