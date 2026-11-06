/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Bloco C: "Editar cliente" a partir dos Detalhes do agendamento (apelido e nome do cadastro). Sem dependência da API: quem usa passa `aoSalvar`
// (site real: clientes.salvar do servidor; demonstração: clientes.salvar simulado). Escape e clique no fundo fecham só esta janela.
import React, { useEffect, useRef, useState } from 'react';
import { Aviso, Btn, Campo, Icone } from './mini.jsx';

export default function EditarCliente({ apelido = '', nome = '', aoSalvar, aoFechar }) {
  const [ap, setAp] = useState(apelido);
  const [no, setNo] = useState(nome);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const caixa = useRef(null);
  useEffect(() => { caixa.current?.focus(); }, []);
  const mudou = ap.trim() !== apelido.trim() || no.trim() !== nome.trim();
  const salvar = async () => {
    setErro('');
    if (!ap.trim() && !no.trim()) { setErro('Informe o apelido ou o nome do cliente.'); return; }
    setSalvando(true);
    try {
      // só manda o que mudou: o nome do cadastro não é reescrito por quem só ajustou o apelido
      const r = await aoSalvar({ ...(ap.trim() !== apelido.trim() ? { apelido: ap.trim() } : {}), ...(no.trim() !== nome.trim() ? { nome: no.trim() } : {}) });
      if (r && r.ok === false) { setErro(r.erro || (r.erros && r.erros[0]) || 'Não foi possível salvar o cliente.'); return; }
      aoFechar();
    } finally { setSalvando(false); }
  };
  return (
    <div className="detalhe-fundo-real" role="dialog" aria-modal="true" aria-label="Editar cliente" data-testid="editar-cliente-modal" style={{ zIndex: 135 }} /* acima da gaveta (121) e dos modais (130) */
      onClick={(e) => { if (e.target === e.currentTarget) { e.stopPropagation(); aoFechar(); } }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); aoFechar(); } }}>
      <div ref={caixa} tabIndex={-1} className="cartao-detalhe detalhe-modal-real">
        <div className="detalhe-topo-real">
          <h3 className="detalhe-titulo-real">Editar cliente</h3>
          <Btn tamanho="sm" onClick={aoFechar} aria-label="Fechar" data-testid="editar-cliente-fechar"><Icone n="x" size={16} /></Btn>
        </div>
        <div className="form-grade">
          <Campo rotulo="Apelido" dica="É o que aparece na agenda."><input value={ap} maxLength={60} autoComplete="off" onChange={(e) => { setAp(e.target.value); setErro(''); }} data-testid="editar-cliente-apelido" /></Campo>
          <Campo rotulo="Nome do cadastro" dica={nome ? undefined : 'Ainda sem nome: o cliente agendou só com o telefone.'}><input value={no} maxLength={100} autoComplete="off" placeholder="Sem nome" onChange={(e) => { setNo(e.target.value); setErro(''); }} data-testid="editar-cliente-nome" /></Campo>
        </div>
        {erro && <Aviso tipo="erro" data-testid="editar-cliente-erro">{erro}</Aviso>}
        <div className="linha-campos">
          <Btn variante="primario" onClick={salvar} disabled={salvando || !mudou} data-testid="editar-cliente-salvar">{salvando ? 'Salvando…' : 'Salvar'}</Btn>
          <Btn onClick={aoFechar} data-testid="editar-cliente-cancelar">Cancelar</Btn>
        </div>
      </div>
    </div>
  );
}
