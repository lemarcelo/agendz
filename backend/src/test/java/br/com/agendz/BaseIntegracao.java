package br.com.agendz;

import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/** Perfil `test`: migrações + lojas de desenvolvimento (apex, dalforno, offbox). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(BancoDeTeste.class)
public abstract class BaseIntegracao {
}
