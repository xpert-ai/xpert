#!/bin/bash

# 检查 .env 文件是否存在
if [ ! -f .env ]; then
    echo ".env 文件不存在，请确保该文件存在！"
    exit 1
fi

# 读取 .env 文件中的环境变量
export $(grep -v '^#' .env | xargs)

# 目标目录参数检查
if [ -z "$1" ]; then
    echo "请提供目标目录路径，例如: ./replace_env_and_copy.sh /path/to/destination"
    exit 1
fi

DEST_DIR=$1

# 遍历当前目录下的所有 .js 文件
for file in *.js; do
    if [ -f "$file" ]; then
        echo "处理文件: $file"

        # 遍历 .env 变量并替换 JS 文件中的字符串
        while IFS='=' read -r key value || [[ -n "$key" ]]; do
            # 跳过注释和空行
            [[ -z "$key" || "$key" =~ ^# ]] && continue
            
            # 使用 sed 进行字符串替换
            sed -i "s|\${$key}|$value|g" "$file"
        done < .env
    fi
done

# 复制 cloud 目录到目标路径
if [ -d "cloud" ]; then
    echo "复制 cloud 目录到 $DEST_DIR"
    cp -r cloud "$DEST_DIR"
else
    echo "cloud 目录不存在，跳过复制"
fi

echo "操作完成！"