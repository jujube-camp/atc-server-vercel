#!/bin/bash
set -e

echo "---- 更新系统依赖 ----"
sudo apt update
sudo apt install -y curl unzip

echo "---- 下载 AWS CLI v2 最新版本 ----"
ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then
    ARCH="x86_64"
elif [ "$ARCH" = "aarch64" ]; then
    ARCH="aarch64"
else
    echo "不支持的架构: $ARCH"
    exit 1
fi

TMP_DIR=$(mktemp -d)
cd $TMP_DIR
curl "https://awscli.amazonaws.com/awscli-exe-linux-$ARCH.zip" -o "awscliv2.zip"

echo "---- 解压并安装 AWS CLI v2 ----"
unzip awscliv2.zip
sudo ./aws/install --update

echo "---- 验证安装 ----"
aws --version

echo "---- 清理临时文件 ----"
cd ~
rm -rf $TMP_DIR

echo "AWS CLI v2 安装完成！"
