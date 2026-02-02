#!/bin/bash

set -e

echo "---- 1. 移除旧版本 Docker（如有） ----"
sudo apt-get remove -y docker docker.io containerd runc || true

echo "---- 2. 更新系统并安装依赖 ----"
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

echo "---- 3. 添加 Docker 官方 GPG key ----"
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "---- 4. 添加 Docker APT 源 ----"
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release; echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

echo "---- 5. 更新 APT 并安装 Docker ----"
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "---- 6. 启动并设置开机自启 ----"
sudo systemctl enable --now docker

echo "---- 7. 将当前用户加入 docker 组 ----"
sudo usermod -aG docker $USER

echo "---- 8. 使 docker 组权限立即生效（无需重连） ----"
# 注意：newgrp 会启动一个新的 shell
newgrp docker <<EOF
echo "---- 9. 测试运行 Docker ----"
docker run --rm hello-world
EOF

echo "Docker 安装完成！无需 sudo 即可使用 docker 命令。"
