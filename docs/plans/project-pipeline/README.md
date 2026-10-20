# Project 流水线历史计划与验收证据

2026-10-20 起，已实现的公共流水线能力转为功能文档维护。本目录保留分批审核、候选构建、兼容性和发布验收的历史证据，不再作为产品使用说明。

## 当前文档入口

| 文档                                                                                                                                      | 内容                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| [中文功能说明](../../zh-Hans/guides/project-pipelines/overview.mdx) / [English](../../en/guides/project-pipelines/overview.mdx)           | 概念、泳道、执行归属、历史状态及统计       |
| [公共架构与扩展](../../zh-Hans/guides/project-pipelines/architecture.mdx) / [English](../../en/guides/project-pipelines/architecture.mdx) | 持久化、原子投影、执行协调、宿主与插件接口 |
| [运行与验收边界](../../zh-Hans/guides/project-pipelines/operations.mdx) / [English](../../en/guides/project-pipelines/operations.mdx)     | 授权、恢复、兼容性、已验证与未验收范围     |

面向用户的产品指南位于独立 `docs` 仓库的 `{language}/ai/projects/pipelines/`，导航为 AI → 项目与任务 → 项目流水线（英文：AI → Projects & Tasks → Pipelines）。功能变化维护当前文档，新的验收结果追加到相应记录；不要改写历史测试结果或将旧候选的证据套用到新产物。

## 继续维护的记录

- [验收汇总与发布条件](./release-readiness-review.md)：发布前缺口、业务迁移条件和可延期事项。
- [分批审核与后续清单](./review-and-follow-ups.md)：前八批审核入口及非阻塞问题。
- [候选构建与回归](./candidate-build-regression.md)：限定源码及产物的本地验证证据。
- [兼容性说明](./release-compatibility-notes.md)：Contracts / SDK 消费者迁移边界。

`*.proposed.json` 是历史设计样例，不是当前插件的可直接部署配置。业务定义以各插件实现和配套验收为准。文档转正不表示目标环境部署、业务迁移或旧 BOM 泳道下线已完成，也不恢复预算、续轮和其他暂停功能。
