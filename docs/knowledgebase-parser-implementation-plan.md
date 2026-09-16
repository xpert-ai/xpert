# 知识库解析器实施计划

创建日期：2026-09-14

更新日期：2026-09-16

状态：第一、二批已合并；第三批 AnyDoc、第四批 OpenDataLoader 及宿主接入已提交平台 [#1044](https://github.com/xpert-ai/xpert/pull/1044) 和插件 [#641](https://github.com/xpert-ai/xpert-plugins/pull/641)。两个 PR 当前均待评审合并；插件发布、生产镜像发布和部署验收仍需独立完成。

### 实施进度（截至 2026-09-16）

| 工作                                              | 当前状态                                                                                                                             | 后续接入复用关系                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| 第一批：按格式选择解析器、MinerU／百度 OCR 集成   | 已合并：主仓库 [#1026](https://github.com/xpert-ai/xpert/pull/1026)、插件 [#628](https://github.com/xpert-ai/xpert-plugins/pull/628) | 复用配置、发现和路由机制                     |
| 第二批：平台 Python Runtime、文件作用域、解析诊断 | 主仓库 [#1031](https://github.com/xpert-ai/xpert/pull/1031) 已合并                                                                   | 复用 Sandbox Jobs、Workspace Files 接口      |
| 第二批：OCR 分块限制和顺序、表格上下文            | 主仓库 [#1032](https://github.com/xpert-ai/xpert/pull/1032) 已合并，本次查到合并时间为 2026-09-15 14:55（北京时间）                  | 保持现有公共处理逻辑                         |
| 第二批：PDFium／MarkItDown 解析器、rag-vlm        | 插件 [#631](https://github.com/xpert-ai/xpert-plugins/pull/631) 已合并                                                               | 复用已合并的接口与处理流程                   |
| 第三批：AnyDoc                                    | 已实现并提交：插件 #641、平台 #1044；待合并                                                                                          | 转换在受管环境执行；扫描页由所选视觉模型转录 |
| 第四批：OpenDataLoader PDF                        | 已实现并提交：插件 #641、平台 #1044；待合并                                                                                          | OCR 依赖与模型由 Runtime 预装；仅声明 PDF    |

AnyDoc 不直接引用 MarkItDown 或 PDFium 插件的内部代码，没有强制的插件加载依赖。两个新插件复用已有 plugin-sdk 接口，本批没有修改 SDK。联合回归、安装验收和最终发布需要核对宿主、SDK、Runtime 镜像和插件包。

完整安装验收需要可运行的 API、匹配版本的插件及已准备好的 Runtime。

### 当前交付与验证记录

| 仓库／目标分支                             | PR                                                         | 已提交内容                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `xpert`／`develop`（本地 `xpert-develop`） | [#1044](https://github.com/xpert-ai/xpert/pull/1044)       | 受管 Node／Java Runtime、知识库格式和导入适配、内置图像理解与多语种提示、Schema Slider、实施计划 |
| `xpert-plugins`／`main`                    | [#641](https://github.com/xpert-ai/xpert-plugins/pull/641) | AnyDoc、OpenDataLoader PDF、外部 rag-vlm 的占位图过滤与自定义提示词传递                          |

已合并的 #631 提供了 rag-vlm 扫描页转录、页码与来源保留、去重和识别失败提示。本次 #641 是在此基础上补充 AnyDoc 测试暴露的问题：普通占位小图跳过模型调用并记录原因，异常的扫描页图片仍记为识别失败，同时传递配置的图片提示词；没有重复提交此前功能。

2026-09-16 提交前的验证记录：

- 平台：52 项聚焦前端测试通过，覆盖 Slider、五种语言实际资源、导入模型和文档编辑配置；9 项 Runtime 合同／校验测试通过，7 个 Runtime family 的 catalog 校验通过。
- 插件：AnyDoc、OpenDataLoader、rag-vlm 构建通过；AnyDoc 28 项、rag-vlm 6 项测试通过。OpenDataLoader 覆盖 31 项用例，其中打包检查首次超时，延长离线检查时限后重跑通过；插件开发 harness 的 3 项生命周期测试通过。
- 提交钩子正常执行；本次文档对齐只校验文档、链接和提交范围，不将上述功能测试表述为重新执行。
- 尚未完成的交付：两个 PR 的评审合并、插件与生产镜像发布、目标部署绑定，以及第 6.9、7.9 节的完整知识库验收矩阵。页面操作由用户手工验收，自动化通过不代表内容保真或检索质量已全部验收。

## 1. 要实现什么

在知识库中按文件格式选择解析器。上传文件后，系统真正调用所选解析器，再将结果交给现有分块和入库流程。

例如：

```text
知识库设置
├── PDF   → MinerU
├── Word  → 内置解析器
└── Excel → 内置解析器

上传文件 → 判断格式 → 读取所选解析器和参数 → 执行解析 → 分块 → 入库
```

以上是使用示意，最终可选格式以各解析器实际验证的能力为准。

## 2. 已确定的边界

- **现有解析能力归为内置解析器。** 内部继续按文件格式处理，保留已有默认行为。
- **新增外部解析能力在 `xpert-plugins` 插件仓库实现。** 宿主负责发现、选择、保存配置、校验和调用。
- **选哪个，就真正用哪个。** 显式选择的插件不可用时给出原因，不静默换成内置解析器。
- **旧知识库未配置时继续走原来的默认行为。** 现有 PDF 配置需要兼容。
- **插件声明支持什么格式，才允许在该格式下选择。** 不根据插件名称或上游宣传推断格式支持。
- **知识库配置默认作用于新导入文件。** 不因修改库级设置自动重解析历史文档；历史文档通过显式重新解析应用新选择。
- **保留文档级覆盖能力。** 文档明确选择优先于库级设置，库级设置优先于系统默认；清除文档覆盖后恢复继承。
- **重新解析与仅重新分块分开。** 仅重新分块使用已有解析结果，不能意外再次调用外部服务。

## 3. 哪些插件已经有了

下表记录 2026-09-14 计划启动时的入口与分批安排；当前实施进度见顶部。第二批已经增加 MarkItDown／PDFium 的知识库解析入口，部署环境仍需核对已加载版本和运行依赖。

| 已有插件          | 计划启动时的入口     | 分批安排                                             |
| ----------------- | -------------------- | ---------------------------------------------------- |
| MinerU            | 已有文档转换策略     | 复用解析实现，补格式声明及知识库配置接线             |
| 百度 PaddleOCR-VL | 已有文档转换策略     | 复用解析实现，补格式声明及知识库配置接线             |
| MarkItDown        | 智能体技能中间件     | 在现有插件中增加知识库解析适配                       |
| PDFium            | PDF 转 Markdown 工具 | 在现有插件中增加知识库解析适配；先核查可复用的调用层 |
| MinerU CLI        | 智能体技能中间件     | 本计划暂不改，知识库优先使用已有 MinerU 解析插件     |

**不用五个都改，也不需要重写已有解析算法。** 两个补声明和接线，两个增加适配，MinerU CLI 保持原用途。

PaddleOCR 复用现有百度插件。第一批已增加官方／自部署服务选择：官方保留百度智能云 API Key + Secret Key 接口，旧配置默认官方；参数集中到系统集成。MinerU 同样区分官方和自部署。

## 4. 第一批：打通知识库选择与执行

### 目标

完成“选哪个，就真正用哪个”，使用内置解析器、已有 MinerU 和百度 PaddleOCR-VL 验证完整链路。

### 宿主需要做什么

1. 沿用 `DocumentTransformerStrategy` 和现有注册表，将 PDF 专用配置扩展为按格式配置。
2. 把已有解析能力整理为内置入口，核实并补齐真实格式声明；保留已有 PDF 默认策略和其他格式默认行为。
3. 每种格式保存解析策略、集成引用和参数，兼容旧 `pdfParser` 数据。
4. 统一系统默认、库级设置、文档覆盖的优先级。切换策略时清理旧策略专属参数及不适用的集成引用。
5. 将设置页的格式预留项接到真实候选列表，复用已有参数表单与集成选择组件。
6. 保存时校验格式、策略、参数和集成权限，执行时重新校验。区分未安装、未配置、无权限和服务失败。
7. 上传、批量导入、文档编辑及重新解析共用格式选择结果；流水线已有显式策略保持原有权威，不被库级设置无条件覆盖。
8. 核查转换缓存和解析快照的身份信息，避免切换策略或参数后使用旧结果。
9. 在处理结果或诊断信息中记录实际使用的策略，便于证明选择已生效。

### 插件需要做什么

| 插件              | 工作                                                                         |
| ----------------- | ---------------------------------------------------------------------------- |
| MinerU            | 核实当前服务适配支持的格式，补格式声明、默认参数及必要校验，复用已有转换实现 |
| 百度 PaddleOCR-VL | 核实当前服务适配支持的格式，补格式声明、默认参数及必要校验，复用已有转换实现 |

### 特别保留的行为

- Excel/CSV 的原生记录模式继续保留首行表头、字段选择、按行处理和表格元数据能力。
- 仅输出 Markdown 的解析器不能被直接当作结构化表格解析器使用；第一批对不兼容的模式组合明确限制。
- 图片理解与文件解析分开，不能因为增加解析器而重复执行 OCR/VLM。
- 不自动重建历史文档，不影响已有智能体工具和中间件入口。

### 验收标准

- 两个知识库可对同一格式选择不同解析器，后台实际调用分别正确。
- 混合格式批量上传时，每份文件使用各自的配置。
- 所选参数和集成真正传给对应插件，而不仅是保存到数据库。
- 旧知识库、旧 PDF 配置和文档级覆盖继续正常工作。
- 插件缺失、权限不足、服务失败时有明确错误，不静默回退。
- 切换策略不会命中旧转换结果；仅重新分块不重新调用解析插件。
- 覆盖针对配置继承、格式路由、真实策略调用、缓存和失败处理的聚焦测试，并完成代表性真实文件验证。

## 5. 第二批：让 MarkItDown 和 PDFium 可用于知识库

### 目标

复用这两个已有插件的底层解析能力，增加知识库可调用的入口，不新建同名插件。

| 插件       | 工作                                                                               |
| ---------- | ---------------------------------------------------------------------------------- |
| MarkItDown | 核查现有运行环境能否供后台知识任务复用；增加文档转换策略、格式声明、参数和依赖检查 |
| PDFium     | 核查现有工具实现的可复用层；增加文档转换策略、PDF 格式声明及参数映射               |

共同工作：

- 接入第一批的候选列表和配置机制，宿主不为每个插件硬编码专用路由。
- 将结果适配到现有文档、分块前内容和资产结构，保留原实现能提供的页码、图片等信息。
- 保留原来的智能体中间件和工具入口。
- 处理超时、取消、临时文件清理及明确的失败结果。
- 仅声明经适配和样例验证的格式；依赖缺失时说明原因。

### 验收标准

- 可在相应格式下选择 MarkItDown/PDFium，上传文件后实际调用对应实现。
- 输出进入分块和入库流程，图片引用等必要资源可正常使用。
- 已有智能体使用方式不回归。
- 每个声明格式有代表性真实文件验证，复杂格式或不支持的文件有明确失败表现。

## 6. 第三批：新增 anydoc 插件

状态：已实现 `xpertai/documents/anydoc/`，Action 为 `1.0.3`，随插件 #641 和平台 #1044 提交、待合并。本地转换、适配、打包和生命周期已有验证；生产目标镜像与完整知识库矩阵仍需验收。

### 6.1 本批要交付什么

新增 `@xpert-ai/plugin-anydoc`，作为知识库“解析引擎”中的一个本地文档转换选项，重点补充旧版 Office、RTF、EPUB 和 OpenDocument 格式。

已采用：**官方 Node.js 绑定 + 平台 Sandbox Jobs + 预装依赖的文档 Node Runtime**。解析结果接回已有资产存储、图像理解、分块和索引流程。

用户安装插件、准备好平台运行环境后，在知识库设置或本次导入中选择 anydoc 即可。首期没有服务地址、Token、Python 路径等配置，不增加系统集成表单。超时、资源限制、依赖版本由平台管理。

### 6.2 上游能力核实

本次核对的 npm 版本为 **`@firecrawl/anydoc@0.2.4`**，要求 Node.js ≥ 20。上游源码快照为 `261fc257d17c3eab0f673be31c408fd9fdc2171a`。实施时锁定版本和依赖完整性，不在文档解析时执行 `npx latest` 或安装依赖。版本依据：[官方包元数据](https://github.com/firecrawl/anydoc/blob/261fc257d17c3eab0f673be31c408fd9fdc2171a/node/package.json)、[npm 包](https://www.npmjs.com/package/@firecrawl/anydoc/v/0.2.4)。

| 已确认的上游事实                                                           | 对接入的影响                                                           |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Rust 转换核心，提供 Node.js 原生绑定                                       | 不需要 Python、LibreOffice 或 OCR 模型来完成本地文本转换               |
| `toMarkdownBytes` 输出 Markdown；非 PDF 的 `toDocument` 输出结构和内嵌资产 | 正文与图片需要分别处理，不能只保存 Markdown                            |
| PDF 不支持 `toDocument`，走独立的 Markdown 转换路径                        | 原生文本由 AnyDoc 提取；本项目在 `needsOcr` 时补充本地分页和扫描页渲染 |
| `needsOcr` 错误提供扫描页序号和总页数                                      | 可以明确指出哪些页需要 OCR，不能伪装成完整解析成功                     |
| Node 包提供可选 hosted OCR，必须显式开启                                   | 插件固定使用 `ocr: 'reject'`，不提供 hosted 选项                       |

依据：[官方 Node 文档](https://github.com/firecrawl/anydoc/blob/261fc257d17c3eab0f673be31c408fd9fdc2171a/node/README.md)、[类型定义](https://github.com/firecrawl/anydoc/blob/261fc257d17c3eab0f673be31c408fd9fdc2171a/node/index.d.ts)、[OCR 调用条件](https://github.com/firecrawl/anydoc/blob/261fc257d17c3eab0f673be31c408fd9fdc2171a/node/anydoc.js)。这些是源码核实，尚不等于本项目运行测试通过。

### 6.3 首期格式范围

当前 `supportedFileTypes` 声明下表中的 13 种格式，已有样例和转换测试；完整知识库验收仍按第 6.9 节执行。声明支持不代表复杂文档的内容保真已全部验收。

| 文件类别     | 当前声明格式         | 约束                                                               |
| ------------ | -------------------- | ------------------------------------------------------------------ |
| Word         | `doc`、`docx`        | 验证正文、表格和内嵌图片                                           |
| PowerPoint   | `ppt`、`pptx`        | 验证正文、表格、备注；不承诺幻灯片画面还原                         |
| 表格         | `xls`、`xlsx`、`csv` | 仅用于“表单／文档”解析；记录模式继续使用内置解析器                 |
| OpenDocument | `odt`、`ods`、`odp`  | 验证表格、正文和资源；不把 ODS 宣称为内置记录解析                  |
| 其他文档     | `rtf`、`epub`        | 验证中文、章节顺序和内嵌图片                                       |
| PDF          | `pdf`                | 本地提取原生文本；扫描页渲染后交给知识库图像理解，未识别页保留诊断 |

`docm/pptm/xlsm/xlsb/pps/pot/ppsx/ppsm` 等上游扩展变体先作为后续候选，不批量放开。HTML、Markdown、TXT、独立图片、音视频不在本批 anydoc 格式声明中，继续使用现有可选解析器。

格式参数通过上游 `formatFromExtension` 映射，不自行猜测旧版 Excel 等格式对应的枚举。保留文件内容检测；发现扩展名与内容不一致时给出明确结果，不将任意未知内容按 CSV 尝试解析。

上游格式依据：[官方支持格式](https://github.com/firecrawl/anydoc#supported-formats)。本表的首期范围是本项目的实施取舍。

### 6.4 运行环境怎么安排

#### 6.4.1 已采用方案

已新增平台 Runtime profile **`document/node-20/v1`**，镜像 family 为 `document-node`。它使用项目已有 Node 20 基础镜像与 Runner Host，预装锁定的 anydoc 及对应平台原生包。

这是平台管理的文档 Node 环境；首期装入 anydoc，后续只有出现明确需求才增加其他工具。插件 Action 只携带转换逻辑，不携带用户配置的可执行程序路径。

| 方式                                  | 本批决定 | 原因                                                        |
| ------------------------------------- | -------- | ----------------------------------------------------------- |
| API 进程直接加载 anydoc 原生库        | 不采用   | 原生转换故障、资源占用与 API 进程绑定，也绕过了已有任务治理 |
| 复用 Python／浏览器／LibreOffice 镜像 | 不采用   | anydoc 不依赖这些组件，耦合无关依赖和发布周期               |
| Sandbox Jobs + 文档 Node 镜像         | 采用     | 依赖预装、版本可校验，复用任务隔离、取消、超时及回收        |

这些取舍针对本批，不改 PDFium 现有 Worker，也不迁移其他插件。

#### 6.4.2 生命周期和依赖校验

```mermaid
flowchart LR
    A[选择 anydoc] --> B[宿主检查 Action 和 Runtime]
    B --> C[Sandbox Jobs 准备任务环境]
    C --> D[Node 调用本地 anydoc]
    D --> E[校验并回传正文和资产]
    E --> F[宿主持久化并继续分块索引]
    E --> G[平台回收本次任务环境]
```

生产环境由现有 Runtime Provider 创建并销毁任务实例。镜像可以预拉取、缓存，不是每个文件重新构建镜像或执行 npm 安装。

本地开发复用项目已有 development-only Provider 模式，增加该 profile 的受管依赖安装和健康检查。依赖放在平台 Runtime 管理目录，由锁文件安装；不增加 `ANYDOC_NODE_PATH` 之类用户配置。**开发模式可能使用本地子进程，并不等同于 Docker 的资源和网络隔离保证。**

文档 Runtime 已提供可信依赖根目录，Action 使用 `createRequire` 从该目录解析 `@firecrawl/anydoc`，不依赖 API 进程或普通 `import` 的查找路径。本地 Provider 和镜像保持相同约定，路径不能来自上传文档或解析参数。

镜像构建和健康检查至少校验：Node 实际版本、anydoc 实际版本、原生模块可加载、锁文件摘要、Runner 摘要、最小文档转换。仅在 manifest 中写上版本号不算检查通过。

上游 npm 当前声明 macOS x64／arm64、Linux x64／arm64 的 GNU／musl 以及 Windows x64 原生包；本批验收优先覆盖本地 macOS arm64 和生产 Linux amd64／arm64。声明有包不代表本项目目标环境已测试。必须在目标平台安装并验证，不能把 Mac 的 `node_modules` 复制进 Linux 镜像。

### 6.5 插件如何接入知识库

#### 6.5.1 插件注册与输入

- 插件包名：`@xpert-ai/plugin-anydoc`；解析器标识：`anydoc`；显示名：`AnyDoc`。
- 安装级别采用 `system`，与平台注册 Sandbox Action 的机制一致。文件和任务仍按租户、组织、知识库隔离。
- 实现已有 `IDocumentTransformerStrategy`，注册 `@DocumentTransformerStrategy('anydoc')`。
- `providesImageText` 声明为 `false`，提取图片资产不等于已识别图片内容。
- 注册 `anydoc.convert` Action，当前版本 `1.0.3`，使用新的文档 Node profile。
- 使用宿主传入的 `fileScope` 和 Workspace Files 读取原文件；不接受任意本地路径或远程下载地址。
- `configSchema` 首期为空；图像理解、分块大小等仍在现有知识库设置中。

复用入口：[SDK Transformer 接口](../packages/plugin-sdk/src/lib/rag/transformer/strategy.interface.ts)、[MarkItDown Sandbox 适配参考](https://github.com/xpert-ai/xpert-plugins/blob/159e9e211e0c4d6c5b5d7b7714991455fb2e01ca/xpertai/middlewares/markitdown/src/lib/convert.ts)。这是新插件，不复制改名现有 MarkItDown 插件或共用其业务标识。

#### 6.5.2 转换与资产

非 PDF 文档分两步读取：使用 `toMarkdownBytes(bytes, format, { ocr: 'reject' })` 获得官方 Markdown，再用 `toDocument(bytes, format)` 获取资产。两个调用受同一个任务时限和输出限制约束。当前 Node API 未提供将修改后的 Document 再序列化的公开方法，首期不移植上游整套 Markdown 渲染器。

资产映射规则：

1. 保存图片及嵌入对象的字节、媒体类型和 `originPart`；落盘文件名由程序生成，不使用文档内路径作为输出路径。
2. 每份文档、每次有效转换使用独立输出命名空间，避免同名文件互相覆盖。重复任务复用须绑定文件内容摘要、作用域、Action 版本和 Runtime 摘要。
3. 通过平台写入文件后，生成已有 `TDocumentAsset` 的 `filePath`、`url`、`type`；图片资产随文档内容交给后续图像理解。
4. 首期保留正文中的图片说明，图片作为资产关联。不按 alt 文本做全局替换，也不宣称已经还原图片在正文中的精确位置。重复说明、空说明不会导致不同图片混淆。
5. EMF／WMF 等未被现有视觉链路支持的图片及其他嵌入对象按文件保存，不假装完成图像识别；有可见提示。外链保留引用，不主动下载。

PDF 只调用 Markdown API；成功时不伪造页码、页数或图片资产。解析器没有返回完整逐页证据时，不生成虚假的 `parserDiagnostics.pages`。

插件输出沿用 `chunks + metadata.assets`：正文标记 `mediaType: 'text'`、`contentFormat: 'markdown'`、`parser: 'anydoc'`。此处的 chunk 是交给公共分块器的转换内容，不自行实现新的分块算法。保存转换原始结果 `result.md`，方便与最终切片对照。

Action 返回内部结果 manifest，包含 schema 版本、正文和受限的资产数据。可先复用固定 `result.json` 输出方式携带 base64 资产；解码后持久化为平台文件。输出限制按 JSON 编码后总大小检查，同时限制解码后字节数和资产数，避免 base64 膨胀绕过限制。宿主校验结果结构、大小、摘要后再使用。

#### 6.5.3 OCR 与图像理解的明确边界

| 输入情况                       | 首期行为                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------- |
| Word／EPUB 等包含普通图片      | 保存资源；开启图像理解时使用当前注册策略；内置 VLM 和外部 rag-vlm 均过滤占位像素 |
| 文本 PDF                       | anydoc 本地提取文字，进入公共分块和索引                                          |
| 纯扫描 PDF                     | 本地渲染为带页码的 `pdf_page` 图片，交给平台图像理解；关闭或失败时保留未识别诊断 |
| 部分页为扫描页的混合 PDF       | 原生页仍由 AnyDoc 提取；扫描页单独渲染并按页序进入后处理                         |
| 开启视觉模型后重试上述扫描 PDF | 视觉模型逐页转录，宿主复用现有分块和 Token 上限，识别结果更新页面诊断            |

页面图片最长边限制为 2200 像素，扫描页处理最多 500 页；图像理解使用知识库配置的模型。普通插图仍使用描述流程，不能把描述当作整页转录。

不调用 Firecrawl hosted OCR，不借用其他插件的内部函数切换解析器。渲染依赖由 Node Runtime 固定；视觉模型是否本地部署取决于用户配置，不能把本地转换等同于模型调用离线。

### 6.6 必要的宿主改动

现有解析器发现和配置已由插件元数据驱动，无需为 anydoc 新建专用页面。但“引擎支持格式”与“允许上传格式”还不是完全统一的来源。

已在平台 #1044 补齐以下入口：

| 位置                                                                                                       | 必要改动                                                               | 保持的行为                                                           |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [上传组件](../apps/cloud/src/app/@shared/knowledge/source-local-file/local-file.component.ts) 及实际调用处 | 将已安装解析器声明的格式纳入可接受格式；RTF、DOC、PPT 等能进入导入流程 | 未选择／未安装可用解析器时明确提示，不能误走文本读取                 |
| [解析器分组](../apps/cloud/src/app/features/xpert/knowledge/processing/parser-engine-rows.ts)              | 同类格式沿用合并行展示，如 DOC／DOCX、PPT／PPTX；新类别只增加必要行    | 不再次按每个扩展名拆成大量重复配置                                   |
| [格式规范化](../packages/contracts/src/ai/knowledge-parser-selection.ts)                                   | 验证扩展名、MIME 和常见别名一致；只补真实缺口                          | 不把 anydoc 支持的格式加入内置解析器能力列表                         |
| [压缩包导入](../packages/server-ai/src/knowledgebase/commands/handlers/knowledgebase-documents.handler.ts) | 默认格式范围与已注册解析器能力衔接；保留调用方显式的更窄范围           | 原有数量、大小、层级限制不变                                         |
| [错误提示](../packages/server-ai/src/knowledge-document/parser-error.ts) 及语言资源                        | 将受限的 anydoc 错误码翻译为可操作的消息                               | 不把所有异常抹成 Internal server error，不回显文档正文或内部绝对路径 |
| 平台 Sandbox Runtime                                                                                       | 新增文档 Node 镜像、定义、注册、受管本地依赖和健康检查                 | Python、浏览器、LibreOffice profile 的约定不变                       |

新增格式的接受范围依据真实已注册能力扩展；已有页面调用方指定 `accepts` 时保留其限制。解析器不可用时保留用户原选择并报错，不静默替换已有配置。

Excel／CSV 的记录模式与文档模式仍由现有设置决定。选择 anydoc 不继承内置 Excel 的“首行表头”“索引列”等控制，也不修改旧文档的索引结构。

### 6.7 错误、取消和资源限制

已知转换错误在 Action 与插件边界保留稳定类别，宿主最终将文档标记为失败。需要 OCR 的页码经过类型和数量限制后再进入提示；完整堆栈留在受控日志中。

| 错误情况                                    | 用户结果                                             |
| ------------------------------------------- | ---------------------------------------------------- |
| 空文件／只有空白结果                        | 文件为空或未提取到可用内容，不建立空索引             |
| `unsupported`                               | 该格式无法由当前 AnyDoc 解析                         |
| `encrypted`                                 | 文件已加密，需解密后上传                             |
| `malformed`／`missingPart`                  | 文件结构损坏或缺少必要内容，建议重新导出             |
| `needsOcr`                                  | 本地渲染扫描页并交给图像理解；未识别时保留页码和诊断 |
| `resourceLimit`／本项目大小上限             | 文件或解析结果超过限制，建议拆分                     |
| Action 缺失、Runtime 未绑定、原生包加载失败 | 显示平台运行环境未就绪，不伪装成文件损坏             |
| 取消／超时／进程退出                        | 明确对应状态；不发布不完整转换结果                   |

资源限额初始建议沿用第二批量级：输入 100 MiB、序列化输出 128 MiB、执行 300 秒、硬截止 360 秒；由真实样例确认后固定在平台与 Action 中。部署侧仍需配置任务资源及并发，不能依赖 Node 的 Promise 超时来停止原生计算。

取消传给同一个 Sandbox Job，重试遵循平台已有幂等与失败任务策略。成功、失败和取消都走平台清理；未完整校验的结果不能进入后续索引。

生产 profile 使用无网络模式；即使环境里存在 Firecrawl API Key，也必须验证没有外发请求。本地开发 Provider 不承诺操作系统级断网，靠固定本地 API 路径及测试保证本插件不启用 hosted OCR；不能把两者混为同一隔离级别。

### 6.8 代码归属与实施顺序

| 顺序 | 仓库            | 计划涉及模块                                                                                                                                          | 交付结果                                  |
| ---- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1    | `xpert-develop` | `packages/sandbox-runtime/images/document-node/`、catalog／构建校验／依赖锁；`server-ai` 的 Runtime 定义、注册和本地 Provider                         | 可健康检查、可执行受管 Node Action 的环境 |
| 2    | `xpert-plugins` | 新插件目录 `xpertai/documents/anydoc/`；`src/index.ts`、module、Transformer、converter、`sandbox-actions/convert/`、构建脚本、测试、README、Changeset | 可独立完成转换和资产映射的系统插件        |
| 3    | `xpert-develop` | 第 6.6 节的格式入口、分组、错误提示及回归测试                                                                                                         | 用户可以导入、选择并处理新增格式          |
| 4    | 两个仓库组合    | 安装、重新处理、日志／数据检查                                                                                                                        | 从导入到索引的完整验收记录                |

插件使用仓库 Nx 生成器和现有发布约定。SDK 首期复用已有接口；若实施发现确实缺少公共合同，再单列评审，不预先增加一套 anydoc 专用 SDK。

交付已按仓库提交：平台 #1044 目标 `develop`，按 Runtime、知识库接入、图像理解、通用 Slider 和文档五类组织，文档状态校正另作后续提交；插件 #641 目标 `main`，分为 AnyDoc、OpenDataLoader 和 rag-vlm 修复三个提交。涉及软件包的 Changeset 均使用 patch，纯文档校正不增加版本发布项。

### 6.9 验收用例

| 编号 | 操作／样例                                              | 预期                                                                   |
| ---- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| A01  | 插件安装并加载                                          | 注册 AnyDoc 解析器和 `anydoc.convert`；未安装时不出现可用入口          |
| A02  | Runtime 未准备好                                        | 健康检查报出环境原因，其他解析器仍可用                                 |
| A03  | 每个首期候选格式各一个有效样例                          | 源码转换、真实 Action、知识库导入均成功，才加入发布能力列表            |
| A04  | 原生文字 PDF                                            | 保留指定正文／表格校验内容；记录解析器为 anydoc                        |
| A05  | 纯扫描 PDF、混合 PDF                                    | 扫描页渲染、页码和顺序正确；图像理解成功才标记识别，失败不冒充完整成功 |
| A06  | Word／EPUB 含图片；含两张相同说明的不同图片             | 图片字节正确、资源地址有效、来源可追踪；无误替换                       |
| A07  | 图像理解开／关、视觉链路不支持的图片格式                | 开启时使用既有流程；关闭时保留资源；不支持时有提示且不冒充识别完成     |
| A08  | CSV／XLS／XLSX 记录模式与文档模式                       | 记录模式保留内置；文档模式才可选 anydoc，旧索引列行为不变              |
| A09  | 文件名带中文／空格／同名，扩展名大写及 MIME 输入        | 格式归一化一致，结果目录不冲突                                         |
| A10  | 损坏、加密、空、超大文件                                | 类别明确的失败提示，无空索引、无敏感日志内容                           |
| A11  | 任务取消、超时、重复重试和并发转换                      | 能停止或回收任务；幂等不串租户、不覆盖其他文档结果                     |
| A12  | 设置 Firecrawl Key，处理扫描 PDF；生产转换 Runtime 断网 | 无 hosted OCR 请求；本地完成转换与渲染，视觉模型在宿主图像理解阶段调用 |
| A13  | 知识库默认配置、本次导入覆盖、重新处理                  | 继承优先级不变；批次覆盖不改旧文档和知识库默认值                       |
| A14  | 未安装／卸载 anydoc 后打开旧配置并重新处理              | 保留配置证据并提示不可用，不静默改为内置解析器                         |
| A15  | RTF 单文件、拖拽、多文件、压缩包内导入                  | 相关入口一致；未通过验证的格式不会因扩大上传范围误获“内置支持”         |
| A16  | 已有 MinerU、百度 OCR、MarkItDown、PDFium 样例          | 配置、解析器选择和完成／失败语义无回归                                 |

验证分三层：插件转换及适配测试、平台 Runtime／格式入口测试、真实安装后的知识库数据验收。构建和自动化测试使用各仓库 Nx；内容结果优先读取日志、原始转换文件和数据库，不自动打开浏览器。

测试记录要区分“任务完成”“原文关键内容存在”“索引成功”。本批包含扫描页转录提示词、占位图过滤与识别诊断，不更换公共分块算法，也不宣称完成检索质量验收。

### 6.10 尚待完成的验证与发布

1. 本地 macOS 受管依赖已安装并运行真实转换；生产 Linux 镜像的加载、内存占用和转换结果仍需独立验收。
2. 图片与嵌入对象的实际 MIME 分布，以及现有资产／VLM 链路对它们的处理；扫描页渲染已实现，但 AnyDoc 的 PDF API 不提供普通内嵌图片资产模型，不能据此宣称完整提取所有 PDF 插图。
3. 同一文档两次解析的成本与输出大小，确认建议限额能覆盖正常样例。
4. Runtime 依赖暴露、manifest 校验和本地 Provider 的一致性；不只验证容器内手工命令。
5. 最终发布格式清单、SDK 最低版本，以及 Runtime 镜像发布和部署绑定。PR 合并不等于镜像、插件和本地进程已自动更新。

不包含：Firecrawl 云服务集成、Agent CLI 技能、独立图片 OCR、无关插件重构、公共分块算法调整及无关 API 启动修复。

## 7. 第四批：新增 OpenDataLoader PDF 插件

状态：已实现 `xpertai/documents/opendataloader/`，Action 为 `1.2.1`，随插件 #641 和平台 #1044 提交、待合并。受管 Java 环境、Hybrid OCR、依赖健康检查、可配置置信度及转换测试已接通；生产镜像发布与部署验收尚待完成。

### 7.1 目标与确定方案

新增 **`@xpert-ai/plugin-opendataloader`**，解析器标识 `opendataloader`，显示名 `OpenDataLoader PDF`，首期只声明 `supportedFileTypes: ['pdf']`。

它作为 PDF 的另一个解析选项，负责提取文字、阅读顺序、表格与图片。结果进入已有知识库处理流程，不替换默认 PDF 解析器，也不改变 MinerU、百度 OCR、PDFium、MarkItDown 或 anydoc 的配置。

**Java 11+ 可以由 Sandbox Runtime 管理。推荐预装 Java 17 JRE 和固定版本的官方 CLI，通过 Sandbox Action 直接调用 JAR。** 镜像中同时保留平台 Runner Host 所需的 Node，不需要再安装 OpenDataLoader 的 Python 或 Node 包装 SDK。

### 7.2 WeKnora 参考了什么

核对源码快照：WeKnora `90e3977714a08e25ccd4506e317fa9c062c9c372`。

| WeKnora 的实现                                                 | Xpert 的接入安排                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------- |
| `OpenDataLoaderParser` 仅用于 PDF，Python `convert()` 启动 JVM | 保留 PDF 专用职责，执行入口改为平台 Sandbox Jobs               |
| 检查 Java 与 Python 包可用性；文档镜像安装 Java 17 JRE         | 改为 Runtime 健康检查，校验 Java、JAR、版本和最小转换          |
| 输出 Markdown 和外置图片，规范化并重写图片引用                 | 保留输出适配思路，加入结构化 JSON 用于页码和来源核对           |
| 使用临时目录并限制并发                                         | 使用每个 Job 的隔离目录、资源上限、超时和平台调度              |
| 可选 hybrid 模式依赖额外 HTTP 服务                             | 本批在 Job 内启动本地后端，OCR 依赖与中英文模型由 Runtime 预装 |
| 提取文本不足 20 字符时改用内置扫描解析器                       | 不照搬这个回退；短文本未必是扫描件，显式选择不静默切换         |

证据：[WeKnora 解析实现](https://github.com/Tencent/WeKnora/blob/90e3977714a08e25ccd4506e317fa9c062c9c372/docreader/parser/opendataloader_parser.py)、[依赖清单](https://github.com/Tencent/WeKnora/blob/90e3977714a08e25ccd4506e317fa9c062c9c372/docreader/pyproject.toml)、[docreader 镜像](https://github.com/Tencent/WeKnora/blob/90e3977714a08e25ccd4506e317fa9c062c9c372/docker/Dockerfile.docreader)。不搬入 WeKnora 的整个 Python docreader 服务。

### 7.3 上游版本与调用方式

本批已锁定 **OpenDataLoader PDF `v2.5.8`**。官方 CLI 发行物是 ZIP 包，构建镜像时下载、校验摘要、解包并固定 JAR 路径；运行任务时不下载、不执行 Maven 构建。[官方发行版](https://github.com/opendataloader-project/opendataloader-pdf/releases/tag/v2.5.8)

Java 核心要求 Java 11+，该版本源码也以 Java 11 为编译目标。平台选择 Java 17 JRE，并在实际镜像上验证打包后的依赖兼容性；仅看编译目标不能代替运行验证。[Java 使用文档](https://opendataloader.org/docs/quick-start-java)、[v2.5.8 Java 构建配置](https://github.com/opendataloader-project/opendataloader-pdf/blob/v2.5.8/java/pom.xml)

官网 Node 快速入门仍写 Node 20+，但本次 npm `@opendataloader/pdf@2.5.8` 和对应版本源码声明 `>=22.13`。它的主要工作仍是启动 `java -jar`。本批直接运行官方 CLI，既避免包装层的额外版本要求，也便于平台控制 JVM 进程树、输出大小和取消。[Node 包配置](https://github.com/opendataloader-project/opendataloader-pdf/blob/v2.5.8/node/opendataloader-pdf/package.json)、[Node 调用实现](https://github.com/opendataloader-project/opendataloader-pdf/blob/v2.5.8/node/opendataloader-pdf/src/index.ts)

调用流程：

```mermaid
flowchart LR
    A[PDF 选择 OpenDataLoader] --> B[读取知识库文件引用]
    B --> C[Sandbox Job：Java 文档环境]
    C --> D[Node Action 启动官方 CLI JAR]
    D --> E[Markdown、JSON、图片]
    E --> F[校验并保存平台资产]
    F --> G[已有图像理解、分块和索引]
    E --> H[回收 JVM 与任务环境]
```

### 7.4 平台 Java Runtime

新增 profile **`document/java-17/v1`**，镜像 family `document-java`。复用现有 Sandbox Runtime catalog、Provider、Runner Host、Workspace Files 和 Job 合同，不另建执行服务。

| 组成               | 管理方式                                                |
| ------------------ | ------------------------------------------------------- |
| Node + Runner Host | 复用平台已有入口，仅用于 Action 编排                    |
| Java 17 JRE        | 固定发行版、补丁版本及镜像摘要；使用 headless 模式      |
| OpenDataLoader CLI | 固定 `2.5.8` 发行包与 JAR 摘要，保留许可证及 NOTICE     |
| 字体和系统库       | 只加入中文、图片处理样例证明需要的依赖，并纳入镜像清单  |
| 临时目录和缓存     | 写入 Job 的可写目录；根文件系统只读，不共享文档中间结果 |
| 网络               | 首期生产 profile 无网络，输入和输出通过平台文件传输     |

不将 Java 加入所有浏览器、Python 或 anydoc Node 镜像。这个 profile 专门承担需要 JVM 的文档任务，依赖与原有环境分开校验、发布。

生产 Provider 创建任务环境后执行 JVM，结束后回收实例；镜像可以缓存，JVM 不作为 API 内常驻服务。首期一个文档一个 Job，不为了节省 JVM 启动成本把不同文档、租户或配置合并为一个不可独立取消的任务。

本地开发可按现有 development-only Provider 增加受管 Java 安装和检查，或使用已配置的容器 Provider。若走本地子进程，仍需平台准备本地 JRE，且不具备容器同等的资源、网络隔离；不能说“用了 Sandbox Jobs 就一定在 Docker 中运行”。不要求用户为解析器填写 Java 路径或 `JAVA_HOME`。

健康检查必须执行实际 Java 版本检查、JAR 摘要检查和最小 PDF 转换。缺少 JRE、JAR 不匹配、Runtime 未绑定分别报错；不得在导入时临时安装软件或退回 API 进程直接解析。

当前 Java Runtime 定义配置 2 CPU、6 GiB 内存、4 GiB 临时磁盘、执行 300 秒、硬截止 360 秒；Action 限制输入 100 MiB、总输出 128 MiB。内存预算须覆盖 JVM、Python OCR、模型、图片及 Node，不能只按 Java 堆估算；生产并发和复杂样例仍需验收。

### 7.5 插件合同与固定参数

- 插件采用 `system` 级别，注册 Transformer 与 `opendataloader.convert@1.2.1` Sandbox Action；数据仍按租户、组织、知识库作用域隔离。
- 只接受平台提供的 PDF 文件引用，使用固定内部文件名，例如 `source.pdf`。目录、JAR 路径和 Java 参数不能来自用户上传文件中的内容。
- `providesImageText: false`。此声明表示导出的普通插图仍需图像理解，不代表禁用了扫描页 OCR；扫描页由本地 Hybrid OCR 处理，按页面证据记录结果。
- `configSchema` 暴露 `ocrConfidenceThreshold`，范围 0–1，默认 0.5；不增加服务地址、Token 或 Java 路径配置。图像理解和分块仍使用知识库已有配置。
- 使用参数数组调用子进程，固定 `-Djava.awt.headless=true`，不拼接 shell 命令。

内部参数：输出 `markdown,json`，图片使用 `external` 和 `png`，开启明确的分页分隔标记，阅读顺序采用 `xycut`，页处理线程设为 `1`。首先提取原生文字，再对未确认页面启动本地 Hybrid OCR；原生页结果保留。暂不启用 HTML 混入 Markdown、敏感信息替换、Tagged PDF 导出或多线程实验选项。[v2.5.8 参数定义](https://github.com/opendataloader-project/opendataloader-pdf/blob/v2.5.8/options.json)

### 7.6 正文、页码和图片怎么回传

1. 在本次任务输出目录中确定性读取 Markdown、JSON 和图片；不按“最近修改的文件”猜测转换结果。
2. JSON 用来读取总页数、元素所属页、元素类型、图片来源和上游提供的坐标。字段按选定版本 schema 校验，不从图片名或正文数字推断页码。[JSON schema](https://github.com/opendataloader-project/opendataloader-pdf/blob/v2.5.8/schema.json)
3. Markdown 以本次转换生成的分页标记拆成分块前内容，并与 JSON 页码核对；防止源文档包含相似标记造成误拆。图像路径里的尖括号、转义和相对路径按 Markdown 语义解析，不能简单用空格截断带空格的路径。
4. 图片只允许指向本次输出目录内的普通文件，检查路径规范化后的归属，拒绝穿越和符号链接逃逸。不同子目录的同名图片保持独立，不按 basename 覆盖或按编号猜配。
5. 文件回传后保存为已有 `TDocumentAsset`，将 Markdown 图片引用改为平台 URL，保留页码和来源。原始 JSON 作为结果资产保留；未被公共合同表达的细粒度坐标先留在原始结果中，不为此新增一套索引结构。
6. 文本内容标记 `parser: 'opendataloader'`、`contentFormat: 'markdown'`、`mediaType: 'text'`；复用公共分块流程。普通提取图片进入现有图像理解流程，不能全部标成 `sourceType: 'pdf_page'`。

结果沿用 Sandbox Job 输出和完整性校验机制。若使用固定结果 manifest 携带图片 base64，限制序列化总大小及解码大小；若通过资产文件回传，明确输出清单并逐项校验。结果全部校验完成前不进入索引。

### 7.7 扫描 PDF 与失败提示

本批提供 **Java PDF 结构解析 + 任务内本地 Hybrid OCR**。无可验证文字的页面使用受管 Python Docling/EasyOCR 后端，中英文模型和依赖预装，CPU 执行；任务结束或失败时停止后端。OCR 最低置信度可在解析器表单通过 Slider 设置，范围 0–1，默认 0.5，参数参与任务复用标识。`image-output external` 仍仅表示提取图片，不等于完整页面渲染。[上游 hybrid 说明](https://opendataloader.org/docs/hybrid-mode)

| 情况                                 | 首期预期                                                           |
| ------------------------------------ | ------------------------------------------------------------------ |
| 原生文字、多栏、表格 PDF             | 提取并保存结果，核对阅读顺序、关键正文与表格内容                   |
| 文本很短但内容有效                   | 正常处理，不使用 WeKnora 的 20 字符阈值自动切换引擎                |
| PDF 中的普通插图                     | 保留资产；图像理解开启时使用已有流程，关闭时不识别                 |
| 纯扫描 PDF，没有提取到可用文本       | 调用任务内本地 OCR；页面证据不能确认成功时明确失败                 |
| 混合 PDF 中有未识别页                | 明确显示未提取到内容的页及覆盖限制，不只根据全文字符数判定完整成功 |
| 加密、损坏、超时、JVM 退出或输出异常 | 区分文件问题与运行环境问题；不静默换成其他解析器                   |

逐页诊断只使用可靠证据：无文本不自动等于空白页，图片描述成功也不自动等于整页文字已识别。当前宿主诊断只定义 `text/blank/needs-ocr/recognized`，没有“覆盖未知”状态。实施时先用原生、扫描、空白和混合样例核实上游证据是否足够；若不足，给出明确的覆盖未确认失败提示，不捏造 `blank` 或 `recognized`。如确需新增公共诊断状态，单列最小合同变更，不能由插件私加状态后被宿主丢弃。

OpenDataLoader 的扫描页使用本地 OCR，不依赖知识库视觉模型。知识库图像理解仍用于导出的普通图片；Java 提取与 OCR 共用 300 秒任务预算，低置信度文本可能被过滤，任务完成不代表识别精度已经验收。

### 7.8 改哪些模块与实施顺序

| 仓库            | 模块                                                                          | 计划改动                                                                  |
| --------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `xpert-develop` | `packages/sandbox-runtime/images/document-java/`、catalog、发布清单和校验脚本 | 新建预装 Java／CLI 的 Runtime，固定版本和摘要，增加镜像验证               |
| `xpert-develop` | `packages/server-ai/src/sandbox/sandbox-job/` 的定义、注册与本地 Provider     | 注册 profile、健康检查、本地受管依赖；复用现有任务执行机制                |
| `xpert-plugins` | 新增 `xpertai/documents/opendataloader/`                                      | 插件入口、Transformer、Sandbox converter、Action、资源适配、测试和 README |
| `xpert-develop` | 现有解析错误映射与必要语言资源                                                | 表达运行环境、文件失败及页面覆盖问题；不调整公共分块算法                  |

PDF 已经有上传、解析器选择和按格式路由能力，本批通常不需要 anydoc 那样扩充上传格式，也不新建专用页面。插件选项通过现有发现机制出现。

先验证 Java Runtime 与真实 CLI，再实现插件结果适配，最后进行知识库组合验收。anydoc 的 Node Runtime 和 OpenDataLoader 的 Java Runtime 分开交付，两个新插件没有互相依赖，不等待另一方代码才能开发。

使用 Nx 构建插件并执行相关测试；按仓库准备 patch Changeset、Runtime 发布和插件包发布。宿主目标为 `develop`，插件目标为 `main`。

### 7.9 验收用例与未验证项

| 编号 | 测试                                                        | 验收结果                                                                 |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| O01  | 安装插件、加载 Action、选择引擎                             | 仅 PDF 出现 OpenDataLoader，其他格式与已有选择不变                       |
| O02  | Java 缺失／低于最低版本、JAR 缺失或摘要错误、未绑定 Runtime | 健康检查提供准确原因，其他插件仍可用                                     |
| O03  | 冷启动与第二次转换同一文字 PDF                              | 两次都成功，不依赖一次未计入超时的预热；记录启动及解析耗时               |
| O04  | 中文、多栏、跨页表格 PDF                                    | 关键正文、页码、表格数据存在且顺序可核对，保存原始 Markdown 和 JSON      |
| O05  | 有效短文本、空白页、扫描页、混合 PDF                        | 短文本不误回退；空白／未识别不混淆，无法确认时明确提示                   |
| O06  | 图片路径含空格、尖括号、HTML 实体；不同目录同名图片         | 平台资源链接正确，不错配、不覆盖、不访问输出目录外文件                   |
| O07  | 图像理解开启／关闭                                          | 普通图片按原流程处理；无完整页面证据时不宣称 OCR 已完成                  |
| O08  | 加密、损坏、空文件、输出 manifest 缺失                      | 文件失败类别清楚，不建立空索引、不静默替换解析器                         |
| O09  | 取消、超时和容器内存限制                                    | JVM 与 Node 进程树均被停止、输出清理；不能只终止等待请求而留下 JVM       |
| O10  | 并发、同名文件、重复重试、不同租户相同文件                  | 作用域与结果目录隔离，幂等和取消针对同一个 Job                           |
| O11  | 无外网生产 Runtime                                          | 转换只访问任务内本地 OCR 后端，不请求外部模型服务、不临时下载安装依赖    |
| O12  | 本地受管环境与 Linux 目标镜像                               | 实际 CLI 转换都通过；安装级别、配置继承、重新处理及已有 PDF 解析器无回归 |

插件适配、Action、失败重试、OCR 后端生命周期和打包均有定向自动化测试；本地样例已进入知识库重处理验证。上述完整矩阵并非全部验收通过，尤其生产 Linux 镜像、并发资源预算和内容准确率仍需核对。Linux arm64 通过镜像与转换验证后再声明支持，不自动打开浏览器。

## 8. 第五批：按实际缺口扩展（不列为首期必做）

| 方向                                          | 启动条件                                                      |
| --------------------------------------------- | ------------------------------------------------------------- |
| OpenDataLoader 更多 OCR 语言、GPU／远端后端   | 在现有本地 CPU OCR 之外有明确需求时，单独评估模型、服务和部署 |
| MinerU/PaddleOCR 的其他云端接口或新增服务模式 | 官方／自部署已纳入第一批；其他接口按明确需求扩展已有插件      |
| HTML/MHTML、XMind 等特殊格式                  | 先验证内置和已有插件覆盖，再补缺失实现                        |
| 音频转写                                      | 明确音频入库需求后，单独接 ASR 服务、模型与配置               |

WeKnora Cloud 暂不接入。MinerU CLI 暂不改造为知识库解析入口。

## 9. 仓库分工与实施顺序

| 位置                                | 责任                                               |
| ----------------------------------- | -------------------------------------------------- |
| Xpert 宿主的 contracts / plugin-sdk | 按格式配置合同、解析器能力合同；尽量扩展现有结构   |
| Xpert 宿主的 server-ai              | 默认继承、校验、策略调用、内置解析、缓存与快照     |
| Xpert 宿主的 cloud 前端             | 格式选择、动态参数、集成选择、状态和错误展示       |
| xpert-plugins                       | 外部解析器实现、格式声明、默认配置、依赖及服务适配 |

```text
第一批：统一接线 + 内置 + MinerU + 百度 PaddleOCR-VL
    ↓
第二批：MarkItDown + PDFium 知识库适配
    ↓
第三批：anydoc 新插件（实施方案见第 6 节）
    ↓
第四批：OpenDataLoader PDF 插件 + Java Runtime（实施方案见第 7 节）
    ↓
第五批：按真实格式或部署缺口扩展
```

涉及共享 SDK 合同变更时，先完成合同与兼容实现，再构建对应插件并验证宿主组合。实际代码修改前确认目标 checkout，避免混用 `xpert` 与 `xpert-develop` 的不同版本。

## 10. 调研代码位置

以下路径用于实施时定位，路径均相对于对应仓库：

| 仓库          | 路径                                                                          | 用途                                     |
| ------------- | ----------------------------------------------------------------------------- | ---------------------------------------- |
| xpert-develop | `packages/contracts/src/ai/knowledgebase.model.ts`                            | 按格式的库级解析配置，兼容旧 `pdfParser` |
| xpert-develop | `packages/contracts/src/ai/knowledge-parser.model.ts`                         | 库级配置向文档配置投影                   |
| xpert-develop | `packages/plugin-sdk/src/lib/rag/transformer/strategy.interface.ts`           | 已有文档转换策略接口                     |
| xpert-develop | `packages/server-ai/src/knowledgebase/parser-settings.service.ts`             | 服务端配置校验                           |
| xpert-develop | `packages/server-ai/src/knowledge-document/parser-config.ts`                  | 默认值与文档配置解析                     |
| xpert-develop | `packages/server-ai/src/knowledge-document/commands/handlers/load.handler.ts` | 实际加载、策略执行及表格分支             |
| xpert-develop | `packages/server-ai/src/knowledgebase/plugins/transformer-common/`            | 已有内置转换实现                         |
| xpert-develop | `apps/cloud/src/app/features/xpert/knowledge/processing/`                     | 共用设置表单及格式预留项                 |
| xpert-plugins | `xpertai/documents/mineru/`                                                   | 已有 MinerU 文档解析插件                 |
| xpert-plugins | `xpertai/documents/baidu-ocr/`                                                | 已有百度 PaddleOCR-VL 文档解析实现       |
| xpert-plugins | `xpertai/middlewares/markitdown/`                                             | 已有 MarkItDown 中间件                   |
| xpert-plugins | `xpertai/tools/pdfium/`                                                       | 已有 PDFium 工具                         |
| xpert-plugins | `xpertai/middlewares/mineru-cli/`                                             | 本计划暂不改造的 MinerU CLI 中间件       |

## 11. 尚待完成的事项

- 平台 #1044（目标 `develop`）与插件 #641（目标 `main`）当前均待评审和合并。
- PR 合并不等于插件包、Runtime 镜像和部署进程已经更新；各部署环境仍需核对安装、密钥与服务连通性。
- AnyDoc 与 OpenDataLoader 已有转换、适配、打包和本地运行验证；完整格式、内容保真和重处理矩阵仍按第 6.9、7.9 节验收。
- 两个生产 Runtime 镜像需完成构建发布、目标平台校验和部署绑定，插件安装不会自动完成这些操作。
- 宿主与插件配套上线；本地图像理解的模型连接和推理质量仍由实际配置决定。
- 第五批继续按实际缺口评估，不扩展为本次的默认交付范围。
