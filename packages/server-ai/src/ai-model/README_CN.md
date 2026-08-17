# AI Model 服务端模块

该模块负责模型 Provider 的服务端编排，包括 NestJS 模块、Provider 注册表接入、CQRS 查询/命令、凭证校验和接口 DTO。

模型 Provider、模型基类以及 LLM、Embedding、Rerank、语音和 AIGC 等通用能力统一由 `@xpert-ai/plugin-sdk` 提供。新增或维护模型插件时，应从 SDK 导入 `ModelProvider`、`AIModel` 及对应的模型类型，不要在 `server-ai` 中新增平行抽象。
