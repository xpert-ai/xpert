# 开发

启动本地开发程序, 默认端口号 8080

```bash
mvn spring-boot:run
```

Debug, 运行下面的命令启动 Spring 服务程序, 然后在 VSCode 里启动 Debug 程序 Attach 到此程序上

```bash
mvn spring-boot:run -Dspring-boot.run.jvmArguments="-Xdebug -Xrunjdwp:transport=dt_socket,server=y,suspend=y,address=8080"
```

# build

打包

`mvn package`

创建 Docker 镜像:
解压 jar 文件到文件夹 *target/dependency*

`docker build -t xpert/olap .`

测试运行镜像

`docker run -d --rm --name xpert-olap -p 8080:8080 xpert/olap`

运行 ClickHouse Client Image 连接 Docker Compose 中的 ClickHouse 服务器:

`docker run -it --rm --network xpert_default --link xpert_clickhouse_1:clickhouse-server -v /mnt/d/dev/gitlab/xpert/olap/docker/:/clickhouse/data yandex/clickhouse-client --host clickhouse-server`

## Demo 数据

导入 ClickHouse 初始化数据:

```bash
$ docker exec -it xpert_clickhouse_1 bash
:/# clickhouse-client --multiquery < /clickhouse/data/createtable.sql
:/# clickhouse-client --multiquery < /clickhouse/data/importdata.sql
```

## Authentication and Authorization

Role-based access control (RBAC) is an approach used to restrict access to certain parts of the system to only authorized users.

https://github.com/oauth2-proxy/oauth2-proxy
https://github.com/mara/mara-acl

Spring Security – Roles and Privileges
https://www.baeldung.com/role-and-privilege-for-spring-security-registration


https://spring.io/guides/tutorials/spring-security-and-angular-js/

https://www.toptal.com/spring/spring-security-tutorial

## ClickHouse Tutorial

Import Sample Dataset

## Mondrian

* mondrian-server
