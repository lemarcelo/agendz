# Pendente do Marcelo (o Claude atualiza este arquivo; apague o item quando fizer)

## Criar as lojas e os donos de produção (quando disser que pode)
Só rode isto **depois** que o login real do site estiver no ar (F2 parte 1; o Claude avisa). Na VPS (`vps1` no PowerShell), uma vez por loja; cada senha aparece **uma única vez**, copie na hora e entregue ao dono (por WhatsApp, por exemplo). Cada dono troca a senha no primeiro acesso.
```
cd /opt/agendz
bash provisionar-loja.sh apex "Apex Estética Automotiva" estetica_automotiva davi "Davi"
bash provisionar-loja.sh dalforno "Barbearia Dalforno" barbearia alan "Alan"
bash provisionar-loja.sh offbox "Offbox Barbearia" barbearia kiko "Kiko"
```
- Esqueceu de copiar uma senha? `bash provisionar-loja.sh <slug> "<Nome>" <tipo> <login> "<Dono>" --redefinir` gera outra.
- O script já grava a logo de cada loja (`logos/<slug>.txt`) e cria o assistente de início pendente.
- Se preferir outro login que não `davi`, `alan` ou `kiko`, troque no comando.
