package br.com.agendz.relatorio;

import br.com.agendz.comissao.ComissaoService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** GET /api/relatorios?mes=AAAA-MM ou ?de=AAAA-MM-DD&ate=AAAA-MM-DD (até 366 dias). Só o proprietário (Relatórios não é liberável; cada pessoa vê o que recebe em "Meus ganhos"). */
@RestController
public class RelatorioController {

    private final RelatorioService relatorios;

    public RelatorioController(RelatorioService relatorios) {
        this.relatorios = relatorios;
    }

    @GetMapping("/api/relatorios")
    @PreAuthorize("hasRole('DONO')")
    public ResponseEntity<RelatorioService.Relatorio> relatorio(@RequestParam(required = false) String mes, @RequestParam(required = false) String de, @RequestParam(required = false) String ate) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(relatorios.gerar(ComissaoService.periodo(mes, de, ate)));
    }
}
