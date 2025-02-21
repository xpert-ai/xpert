## README for docker Deployment

Welcome to the `docker` directory for deploying XpertAI using Docker Compose. This README outlines the updates, deployment instructions, and migration details for existing users.

### Startup

Start the Docker containers

`docker compose up -d`

f you need to enable multidimensional modeling capabilities for data analysis, please start the Docker containers using the `bi` profile

`docker compose --profile bi up -d`

### For Chinese users

遇到网络问题的中国用户可以使用以下命令部署：

`docker compose -f docker-compose.cn.yml up -d`

同时要启用数据分析平台的可以使用以下命令：

`docker compose -f docker-compose.cn.yml --profile bi up -d`

