/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Regras do Atender no site real (5d-4c), só do proprietário: a forma de pagamento padrão do atendimento feito e quais campos o botão Atender
// exige no agendamento futuro e no atendimento feito. Quem decide é o servidor (PUT /api/estabelecimento/regras-atendimento); a tela mostra a mensagem dele.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs). Classes de CSS terminam em `-real`.
import React, { useEffect, useState } from 'react';
import { regras as api } from '../../services/api-real.js';
import { CAMPOS_DO_ATENDER, FORMAS_PAGAMENTO } from '../../domain/atender-form.js';
import { capAtiva } from '../../domain/tipos.js';
import { Aviso, Btn, Campo } from '../leve/mini.jsx';

const VEICULO = ['veiculo', 'placa', 'modelo', 'porte']; // só na estética (v121)
const CAMPOS_FUTURO = () => ['nome', 'telefone', 'profissional', 'vendedor', ...(capAtiva('usaVeiculo') ? VEICULO : [])];
const CAMPOS_LOCAL = () => ['nome', 'telefone', 'profissional', 'vendedor', 'formaPagamento', ...(capAtiva('usaVeiculo') ? VEICULO : [])];

export default function RegrasAtendimento() {
  const [regras, setRegras] = useState(null);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.obter().then((r) => { if (!vivo) return; if (r.ok) setRegras(r.regras); else setErro(r.erro); });
    return () => { vivo = false; };
  }, []);

  if (!regras) return <section className="regras-real" data-testid="regras-real">{erro ? <Aviso tipo="erro" data-testid="regras-erro">{erro}</Aviso> : <p className="muted" role="status">Carregando…</p>}</section>;

  const alternar = (tipo, campo) => {
    setOk(''); setErro('');
    setRegras((r) => ({ ...r, [tipo]: r[tipo].includes(campo) ? r[tipo].filter((x) => x !== campo) : [...r[tipo], campo] }));
  };
  const salvar = async (e) => {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true); setErro(''); setOk('');
    const r = await api.gravar({ formaPagamentoPadrao: regras.formaPagamentoPadrao, camposObrigatorios: { futuro: regras.futuro, local: regras.local } });
    setSalvando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setRegras(r.regras); setOk('Regras salvas.');
  };
  const grupo = (tipo, titulo, campos) => (
    <fieldset className="atender-real-bloco" data-testid={`regras-${tipo}`}>
      <legend>{titulo}</legend>
      {campos.map((c) => (
        <label key={c} className="check-linha"><input type="checkbox" checked={regras[tipo].includes(c)} onChange={() => alternar(tipo, c)} data-testid={`regras-${tipo}-${c}`} /><span>{CAMPOS_DO_ATENDER[c]}</span></label>
      ))}
    </fieldset>
  );

  return (
    <form className="regras-real" onSubmit={salvar} data-testid="regras-real" aria-label="Regras do atendimento">
      <h3>Regras do atendimento</h3>
      <Campo rotulo="Forma de pagamento padrão (atendimento feito)">
        <select value={regras.formaPagamentoPadrao} onChange={(e) => { setOk(''); setErro(''); setRegras({ ...regras, formaPagamentoPadrao: e.target.value }); }} data-testid="regras-forma">
          {FORMAS_PAGAMENTO.map(([k, r]) => <option key={k} value={k}>{r}</option>)}
          <option value="">Sem padrão (perguntar sempre)</option>
        </select>
      </Campo>
      {grupo('futuro', 'Campos obrigatórios no agendamento (data futura)', CAMPOS_FUTURO())}
      {grupo('local', 'Campos obrigatórios no atendimento feito (agora ou passado)', CAMPOS_LOCAL())}
      {erro && <Aviso tipo="erro" data-testid="regras-erro">{erro}</Aviso>}
      {ok && <p className="msg-ok" role="status" data-testid="regras-ok">{ok}</p>}
      <div className="acoes"><Btn variante="primario" type="submit" disabled={salvando} data-testid="regras-salvar">{salvando ? 'Salvando…' : 'Salvar regras'}</Btn></div>
    </form>
  );
}
