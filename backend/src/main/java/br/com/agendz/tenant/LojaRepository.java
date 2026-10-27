package br.com.agendz.tenant;

import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class LojaRepository {

    private static final RowMapper<Loja> MAPA = (rs, i) -> new Loja(
            rs.getObject("id", UUID.class),
            rs.getString("slug"),
            rs.getString("nome"),
            rs.getString("tipo"),
            rs.getString("logo"),
            rs.getString("tema_cor"),
            rs.getString("tema_cor2"));

    private static final String COLUNAS = "select id, slug, nome, tipo, logo, tema_cor, tema_cor2 from loja ";

    private final JdbcTemplate jdbc;

    public LojaRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Loja> porSlug(String slug) {
        return jdbc.query(COLUNAS + "where slug = ?", MAPA, slug).stream().findFirst();
    }

    /** Domínio próprio só vale VERIFICADO. */
    public Optional<String> slugDoDominioVerificado(String host) {
        return jdbc.query(
                "select l.slug from loja_dominio d join loja l on l.id = d.loja_id where d.host = ? and d.verificado",
                (rs, i) -> rs.getString(1), host).stream().findFirst();
    }
}
