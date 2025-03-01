#!/bin/bash
set -ex

# 检查 .env 文件是否存在
if [ -f .env ]; then
    # 读取 .env 文件，过滤掉空行和注释行，然后导出变量
    while IFS='=' read -r key value; do
        # 跳过空行和以 # 开头的注释行
        case "$key" in
            ''|\#*) continue ;;
        esac
        
        # 去除首尾的空白字符
        key=$(echo "$key" | xargs)
        value=$(echo "$value" | xargs)
        
        # 导出环境变量
        if [ -n "$key" ]; then
            export "$key=$value"
        fi
    done < .env
else
    echo "警告: .env 文件不存在"
fi

# In production we should replace some values in generated JS code
sed -i "s#DOCKER_API_BASE_URL#$API_BASE_URL#g" *.js
sed -i "s#\"DOCKER_ENABLE_LOCAL_AGENT\"#$ENABLE_LOCAL_AGENT#g" *.js
sed -i "s#DOCKER_CLIENT_BASE_URL#$CLIENT_BASE_URL#g" *.js
sed -i "s#DOCKER_SENTRY_DSN#$SENTRY_DSN#g" *.js
sed -i "s#DOCKER_CLOUDINARY_CLOUD_NAME#$CLOUDINARY_CLOUD_NAME#g" *.js
sed -i "s#DOCKER_CLOUDINARY_API_KEY#$CLOUDINARY_API_KEY#g" *.js
sed -i "s#DOCKER_GOOGLE_MAPS_API_KEY#$GOOGLE_MAPS_API_KEY#g" *.js
sed -i "s#DOCKER_GOOGLE_PLACE_AUTOCOMPLETE#$GOOGLE_PLACE_AUTOCOMPLETE#g" *.js
sed -i "s#DOCKER_DEFAULT_LATITUDE#$DEFAULT_LATITUDE#g" *.js
sed -i "s#DOCKER_DEFAULT_LONGITUDE#$DEFAULT_LONGITUDE#g" *.js
sed -i "s#DOCKER_DEFAULT_CURRENCY#$DEFAULT_CURRENCY#g" *.js
sed -i "s#DOCKER_CHATWOOT_SDK_TOKEN#$CHATWOOT_SDK_TOKEN#g" *.js
sed -i "s#DOCKER_DEMO#$DEMO#g" *.js

rm -rf /srv/pangolin/
cp -r apps/api/ /srv/pangolin/

echo "操作完成！"