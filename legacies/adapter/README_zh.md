# ocap-adapter

Datasouce adapters for ocap project.

| Adapter | Catalog | How to get catalogs `getCatalogs` |
| --- | --- | --- |
| SAP HANA | SCHEMA_NAME | `SELECT * FROM "SYS"."SCHEMAS"` |

## 每类数据库的接入方式
| 数据库            | Node.js 驱动方式                    | 说明                                                   |
| -------------- | ------------------------------- | ---------------------------------------------------- |
| **OpenGauss**  | 使用 `pg` 驱动（兼容 PostgreSQL 协议）    | OpenGauss 兼容 PostgreSQL 协议，使用 `pg`/TypeORM/Prisma 即可 |
| **MariaDB**    | `mysql2`、`mariadb`、TypeORM 支持   | 与 MySQL 兼容，可用 TypeORM、Prisma                         |
| **ClickHouse** | 使用 `@clickhouse/client`         | 推荐使用 ClickHouse 官方 JS 客户端                            |
| **达梦**         | 使用 `odbc` 驱动或 DM 提供的 `dmclient` | 需通过 ODBC 连接，或使用 `dmjdbc` + `node-jdbc` 接入            |
| **人大金仓**       | 使用 PostgreSQL 驱动 `pg` 或 `odbc`  | 金仓兼容 PostgreSQL 协议，pg 驱动可用                           |

```json
"node-addon-api": "^8.4.0",
"odbc": "^2.4.9",
```
