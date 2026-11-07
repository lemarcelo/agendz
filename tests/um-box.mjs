// G4: na estética só o box bloqueia a agenda (o profissional só recebe comissão). Teste que verifica "o mesmo recurso não atende dois ao mesmo tempo"
// chama isto para ficar com UM box ativo, que faz o papel que o profissional fazia. (Arquivo à parte: importar helpers.mjs tem efeito colateral.)
import { store } from '../src/services/api.js';

export function umBoxSo() {
  const st = store.getState(); // troca o objeto (não altera o do seed compartilhado)
  st.estabelecimento = { ...st.estabelecimento, boxes: st.estabelecimento.boxes.map((b, i) => ({ ...b, ativo: i === 0 })) };
}
