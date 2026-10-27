#!/usr/bin/env bash
# Prepara uma VPS Ubuntu 24.04 limpa para o Agendz. Rode UMA vez, como root:  bash preparar-servidor.sh
# Faz: atualizações, usuário `agendz` (sem senha, só chave SSH), SSH sem senha e sem root, firewall (22/80/443), fail2ban, Docker.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Rode como root."; exit 1; }
USUARIO=agendz

export DEBIAN_FRONTEND=noninteractive
apt-get update -y && apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades rsync
timedatectl set-timezone America/Sao_Paulo || true

# usuário comum com sudo e as mesmas chaves SSH do root
id "$USUARIO" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$USUARIO"
usermod -aG sudo "$USUARIO"
echo "$USUARIO ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-agendz && chmod 440 /etc/sudoers.d/90-agendz
install -d -m 700 -o "$USUARIO" -g "$USUARIO" "/home/$USUARIO/.ssh"
if [ -s /root/.ssh/authorized_keys ]; then
  cat /root/.ssh/authorized_keys >> "/home/$USUARIO/.ssh/authorized_keys"
  chown "$USUARIO:$USUARIO" "/home/$USUARIO/.ssh/authorized_keys"; chmod 600 "/home/$USUARIO/.ssh/authorized_keys"
fi
# TRAVA DE SEGURANÇA: só desliga senha e root se o novo usuário já tem chave (senão você ficaria sem acesso)
if [ -s "/home/$USUARIO/.ssh/authorized_keys" ]; then
  cat > /etc/ssh/sshd_config.d/99-agendz.conf <<CONF
PasswordAuthentication no
PermitRootLogin no
CONF
  sshd -t && systemctl reload ssh
  echo "SSH: login por senha e root desligados. Entre com: ssh $USUARIO@IP_DA_VPS"
else
  echo "ATENÇÃO: não achei chave SSH em /root/.ssh/authorized_keys. Mantive senha e root ligados. Adicione sua chave pública e rode de novo."
fi

# firewall
ufw default deny incoming && ufw default allow outgoing
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
ufw --force enable
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades || true

# Docker (script oficial)
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
usermod -aG docker "$USUARIO"
install -d -o "$USUARIO" -g "$USUARIO" /opt/agendz
echo "Pronto. Saia e entre como $USUARIO:  ssh $USUARIO@IP_DA_VPS"
