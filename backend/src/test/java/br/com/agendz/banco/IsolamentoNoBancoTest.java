package br.com.agendz.banco;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import br.com.agendz.BaseIntegracao;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

/** Gate 3 (f): Row Level Security. As consultas de negócio rodam como `agendz_app` (sem superusuário), com `app.loja_id` por transação. */
class IsolamentoNoBancoTest extends BaseIntegracao {

    private static final String LOJA_A = "00000000-0000-0000-0000-0000000000a1"; // apex
    private static final String LOJA_B = "00000000-0000-0000-0000-0000000000b1"; // dalforno

    @Autowired
    DataSource ds;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void dados() {
        jdbc.update("delete from cliente"); // conexão do dono: o RLS não a limita
        jdbc.update("insert into cliente (loja_id, nome, telefone_cif, telefone_hash) values (?::uuid, 'Ana', 'v1:teste', md5('5511900000001')), (?::uuid, 'Bia', 'v1:teste', md5('5511900000002'))", LOJA_A, LOJA_A);
        jdbc.update("insert into cliente (loja_id, nome, telefone_cif, telefone_hash) values (?::uuid, 'Caio', 'v1:teste', md5('5511900000001'))", LOJA_B); // mesmo telefone em outra loja é permitido
    }

    private int contarComo(String lojaId) throws SQLException {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try (Statement st = c.createStatement()) {
                st.execute("SET LOCAL ROLE agendz_app");
                if (lojaId != null) st.execute("SELECT set_config('app.loja_id', '" + lojaId + "', true)");
                try (ResultSet rs = st.executeQuery("select count(*) from cliente")) {
                    rs.next();
                    return rs.getInt(1);
                }
            } finally {
                c.rollback();
            }
        }
    }

    @Test
    void semLojaNaTransacaoNaoVeNada() throws SQLException {
        assertEquals(0, contarComo(null));
    }

    @Test
    void cadaLojaVeSoOsSeus() throws SQLException {
        assertEquals(2, contarComo(LOJA_A));
        assertEquals(1, contarComo(LOJA_B));
    }

    @Test
    void naoGravaEmOutraLoja() throws SQLException {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try (Statement st = c.createStatement()) {
                st.execute("SET LOCAL ROLE agendz_app");
                st.execute("SELECT set_config('app.loja_id', '" + LOJA_B + "', true)");
                assertThrows(SQLException.class, () -> st.execute(
                        "insert into cliente (loja_id, nome, telefone_cif, telefone_hash) values ('" + LOJA_A + "', 'Intruso', 'v1:teste', md5('5511999999999'))"));
            } finally {
                c.rollback();
            }
        }
    }

    @Test
    void tipoDaLojaNuncaMuda() {
        assertThrows(DataAccessException.class,
                () -> jdbc.update("update loja set tipo = 'estetica_automotiva' where slug = 'dalforno'"));
    }
}
