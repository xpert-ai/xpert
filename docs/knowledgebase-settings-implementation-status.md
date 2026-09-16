# 知识库设置功能实现状态

核查日期：2026-09-16。核查范围：“新建知识库 / 知识库设置”弹窗、共用文档处理设置、配置保存及执行链路，并对齐[解析器实施计划][parser-plan]。Wiki 功能不在本文评估范围内。

源码基线：平台 `develop` 的 `665d603ba` 与本批文档解析改动；插件使用包含 #631 的 `main` 基线与两个新插件。本文中的“已实现”指源码已接通；PR 合并、插件包发布、Runtime 准备、当前进程加载和真实验收分别确认，不能相互代替。

## 1. 当前结论

**原功能编号 01–16 均已有对应实现；同步后的 develop 也已提供 18 的 FAQ 语义反例排除。仍未开放的设置为 17、19、20。AnyDoc 和 OpenDataLoader 插件及宿主接入已实现，正准备提交，部署和完整验收独立完成。**

知识库与文档导入 / 编辑弹窗共用处理表单和设置组件。解析器已按文件格式保存、校验和执行；语言提示、自动 / 结构感知分块、Token 上限、图像理解和问题生成均有执行链路。Excel 首行表头、记录模式表格元数据和自动标签也已有配置、服务端处理和结果消费。

上述功能各有适用边界：格式行不等于所有后缀可解析，表格元数据不覆盖任意 PDF 表格，自动标签只从本知识库已有标签选择。音频入库配置及按库切换文件 / 向量存储仍未开放。

原功能编号 01–20 与解析器计划中的第一至第五批是两套编号，不能将“第二批解析器”理解为仍未实现的全部知识库设置。本次不重新评估切片质量，也不把历史测试数量作为当前版本的验收结论。

### 解析器交付进度

| 工作                                                  | 本次核对状态                                                                                                                      | 使用条件与后续安排                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 第一批：按格式选择、MinerU / 百度 OCR 官方与自部署    | 宿主 [#1026](https://github.com/xpert-ai/xpert/pull/1026)、插件 [#628](https://github.com/xpert-ai/xpert-plugins/pull/628) 已合并 | 使用对应插件版本，配置系统集成并确认服务可用                             |
| 第二批：Python 文档 Runtime、作用域文件访问、解析诊断 | 宿主 [#1031](https://github.com/xpert-ai/xpert/pull/1031) 已合并                                                                  | Runtime 和插件包仍需实际准备、安装与加载                                 |
| 第二批：OCR 补分块、顺序与表格上下文                  | 宿主 [#1032](https://github.com/xpert-ai/xpert/pull/1032) 已合并                                                                  | 不代表所有解析器和视觉模型的内容质量已经验收                             |
| 第二批：PDFium / MarkItDown 知识库适配及 rag-vlm      | 插件 [#631](https://github.com/xpert-ai/xpert-plugins/pull/631) 已合并                                                            | 发布和匹配宿主的组合验收仍需独立确认                                     |
| 第三批：AnyDoc                                        | 插件、宿主接入及本地转换已实现                                                                                                    | Node Sandbox Jobs；扫描页本地渲染后走知识库图像理解，见解析器计划第 6 节 |
| 第四批：OpenDataLoader PDF                            | PDF 插件、本地 OCR、置信度 Slider 已实现                                                                                          | Java 17 / 官方 CLI + 受管 Python OCR 后端和模型，见解析器计划第 7 节     |

AnyDoc 与 OpenDataLoader 没有相互加载依赖。代码实现与某个部署环境中已安装可用是不同状态；新插件依赖本批受管 Runtime 和宿主改动。第五批保留更多 OCR 语言、GPU / 远端后端和特殊格式等实际缺口。

## 2. 模块状态总览

| 模块     | 当前已实现                                                                                 | 尚未完成或使用边界                                                          |
| -------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 基本信息 | 名称、描述、创建时选择文档库或 FAQ 库及保存                                                | Wiki 不在本次范围内                                                         |
| 模型配置 | Embedding、LLM、视觉模型绑定；问题生成另有模型选择                                         | 问题生成开启时需选择有效模型，不能只绑定知识库 LLM 就视为已开启             |
| 检索设置 | 向量、关键词、图谱、混合检索、Weighted RRF 和重排；问题派生向量已接入向量召回              | 可用性取决于模型、索引和部署配置；问题生成与 FAQ 是不同功能                 |
| 解析引擎 | 按格式选择、保存、校验与路由；文档覆盖、实际解析器记录与快照；AnyDoc / OpenDataLoader 接入 | 候选取决于插件声明、安装和 Runtime 可用性                                   |
| 分块设置 | 大小、重叠、多分隔符、普通 / 父子参数、Token 上限、语言提示、自动 / 结构感知及只读预览     | 自动策略不调用 LLM，不自动切换普通 / 父子结构；表格记录模式有独立处理规则   |
| 图像处理 | 共用库级 / 文档表单、模型与提示词；整页转录、补分块、占位图过滤与多语种识别提示            | 依赖正确图片来源和可用模型；提取图片不等于完成 OCR                          |
| 表格处理 | 首行表头、原生表格记录、字段索引与表格元数据生成 / 展示 / 检索消费                         | 元数据限适用的原生 CSV / Excel 记录模式；不是任意转换器输出的 Markdown 表格 |
| 音频处理 | 合同已有 Audio 类型，平台另有语音转文本能力                                                | 此弹窗的 ASR 引擎配置仍未接入知识库处理                                     |
| 高级设置 | AI 问题生成；自动标签配置、后台分类和标签关联                                              | 问题数量为上限；自动标签不创建新标签，遵守人工标签与并发写入保护            |
| 存储引擎 | 平台文件存储和系统级向量存储                                                               | 此弹窗不能按库选择或切换存储引擎                                            |
| FAQ 设置 | 创建期索引方式、合并 / 分别索引、精确 / 语义反例排除                                       | 语义排除依赖配置模型和向量预热；创建后索引配置只读属于明确限制              |

侧栏的“已支持 / 创建后配置 / 预览”仍是界面声明，不能代替每个控件的保存、执行证据。

## 3. 已实现功能与实际边界

### 3.1 共用配置、继承与文档入口

- `createKnowledgeProcessingForm()` 和 `KnowledgeProcessingSettingsComponent` 承担知识库及文档弹窗共用的处理配置、回填和校验，保存由各入口负责。
- 知识库 `buildPayload()` 提交共用表单生成的 `parserConfig`；服务端校验按格式解析器、分块、语言、图像、Token 上限、问题和表格配置。自动标签使用独立的库级 `automaticTagging` 配置。
- 有效配置优先级为“文档显式配置 > 知识库默认配置 > 内置默认值”，并处理嵌套分块参数。新导入按有效配置保存；旧文档已保存配置不按数值猜测来源。
- 文本和图片类别继承适用的库级处理参数；原生表格记录模式单独处理首行表头、工作表、索引字段和表格元数据，不等于把每行交给全文字符分块器。按格式选择外部解析器时还需遵守表格模式兼容校验。
- 一个知识库只允许一种分块结构。文档级覆盖不能把普通结构临时改成父子结构；库级结构切换受已有内容约束。
- 修改库级处理默认值不等于自动重处理全部历史文档；历史内容采用新参数需要按文档重处理流程执行。

证据：[共用表单][processing-form]、[知识库弹窗][dialog-ts]、[导入模型][import-model]、[配置归一化][parser-config]、[服务端配置与预览][parser-settings]。

### 3.2 原设置第一批 01–08

| 编号 | 功能           | 当前行为                                                                                                                      |
| ---- | -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 01   | 分块大小和重叠 | 库级保存、回填、导入继承及正式分块已接通；文档显式配置优先                                                                    |
| 02   | 多分隔符       | 保存完整列表和顺序，支持回填、换行转义及旧单分隔符兼容                                                                        |
| 03   | 图片理解开关   | 库级默认与文档覆盖接通；显式关闭后不由默认值重新开启                                                                          |
| 04   | 图片提示词     | 复用 `promptTemplate` 表达语言和解析要求，进入 VLM system 提示词，支持 `{{context}}` 和空模板回退                             |
| 05   | 普通分块策略   | 从已注册策略选择，保存类型和参数并按真实策略执行                                                                              |
| 06   | 父子分块       | 父 / 子参数、分块结构校验、结构生成与父级上下文链路已接通                                                                     |
| 07   | 测试分块效果   | TXT / Markdown 文本只读预览使用当前未保存配置，与正式切分共用 `splitKnowledgeDocuments()`；不保存文档，不调用模型或解析转换器 |
| 08   | PDF 库级解析器 | 从声明支持 PDF 的已注册策略选择，保存参数和集成配置，服务端校验可用性，支持文档覆盖                                           |

预览只验证分块，不等于验证 PDF 解析、图片理解或 AI 问题生成。其他格式的库级默认引擎现已接通，见第 3.5 节；每个实际格式仍需有可用策略。

证据：[共用设置模板][processing-html]、[分块预览组件][chunk-preview]、[服务端配置与预览][parser-settings]、[正式加载][document-loader]、[共用切分][split-documents]、[VLM 策略][vlm-strategy]。

### 3.3 11：每块 Token 上限已实现

- `maxChunkTokens` 已进入共享合同、共用表单、保存回填、文档覆盖及服务端校验。允许 0–8192 的整数，0 表示不增加 Token 限制。
- 先执行所选字符 / Markdown / 父子策略，再由 `limitChunkTokens()` 对超限文本叶子块继续细分。父级上下文块及非文本块不按此上限拆分。
- 计数使用 `cl100k_base` 精确编码；不是按字符数估算，也不是随当前模型切换 tokenizer。每个输出片段重新计数，保留完整 Unicode 字符；上限小到无法容纳字符时明确报错。
- 保留父块 ID 和子块关联；新增拆分边界不额外复制重叠文本。只在来源偏移与内容一一对应时调整精确偏移。
- 设置预览和正式处理共用切分及 Token 限制代码，预览显示 Token 数。旧文档不会仅因代码更新就自动重新切分。

证据：[共用表单][processing-form]、[共用切分][split-documents]、[Token 限制][token-limit]、[Tokenizer][tokenizer]。

### 3.4 14：AI 问题生成已实现

- `questionGeneration` 保存启停、专用模型、每块最多问题数和自定义要求；缺省关闭。表单约束数量 1–10、要求最多 4000 字符，服务端也有配置校验；内容不足时不保证生成满额。
- 文档派生索引发布链路已接入问题生成队列与消费者。问题生成独立于原文档处理状态，模型失败记录问题失败状态，不把已完成的源文档改成处理失败。
- 生成状态与问题列表保存在源分块 `metadata.questionGeneration`，问题另建派生向量，映射回源分块；问题没有作为普通子分块插入父子树。
- 父子结构只对可检索子块生成问题，父块作为上下文。内容不足允许返回空问题数组，并记录正常完成的空结果。
- 模型失败不自动重复调用；索引重试可以复用已保存的问题。实现中有来源变化检查、过期结果过滤和派生向量清理。
- 分块界面已有问题列表、状态、重新生成 / 重试及单条删除；接口检查文档与分块访问及生成条件。
- 向量召回过滤失效问题向量，并避免同一源分块的多个问题挤占其他来源。实际模型生成质量和真实检索效果仍需验收。

证据：[共用表单][processing-form]、[派生任务分发][derived-publication]、[生成服务][question-service]、[问题接口][question-controller]、[问题向量][question-vectors]、[向量召回][vector-retriever]、[问题界面][question-ui]。

### 3.5 09：其他格式的库级解析器选择已接通

- 共用表单按 Word、演示文稿、Excel、图片等类别展示，保存时展开为真实后缀对应的 `parserConfig.parsers`；继续兼容旧 `pdfParser`。
- 候选来自策略的 `supportedFileTypes`。`parser-engine-rows.ts` 中仍有 `RESERVED_PARSER_ROWS` 这个名称，但不能据此认定所有非 PDF 行仍未接通，也不能据一条预设行认定所有后缀都已支持。
- 一个类别选中的插件只应用于它支持的格式，其余格式明确提示走可用内置解析器；例如百度 OCR 不支持的 GIF / WebP。没有内置能力的格式不能伪装成可解析。
- 上述类别内的格式分配与“执行失败后回退”不同：明确分配给插件的文件，在插件缺失、无权限、配置错误或转换失败时应报错，不静默换引擎。
- MinerU / 百度 OCR 的服务类型、地址、凭证和识别参数集中在系统集成；解析引擎处选择集成。百度官方保留 API Key + Secret Key，历史配置默认官方。
- 正式执行记录实际解析器及诊断；转换快照区分解析配置，仅重新分块复用解析结果，重新解析才重新调用转换器。

证据：[共用表单][processing-form]、[格式分组][parser-rows]、[解析配置合同][parser-contract]、[服务端校验][parser-settings]、[正式加载][document-loader]、[转换快照][transform-snapshot]；插件交付见顶部 PR 与[解析器实施计划][parser-plan]。

### 3.6 10、16：Excel 首行表头与表格元数据已接通

- `spreadsheet.firstRowAsHeader` 已保存、继承并传入原生 CSV / Excel 记录读取；缺省 `true`，关闭后首行作为数据参与处理。
- 原生记录解析同时生成行内容、字段、工作表与表来源，作为表格元数据的输入。首行或字段变化后要验证索引字段，不能继续沿用失效列名。
- `tableMetadataRequirements` 已进入共用表单、服务端配置和生成提示词。它是可选要求，留空仍可按默认要求生成；生成使用知识库 LLM，无有效模型时明确记录跳过原因。
- `KnowledgeTableMetadataService` 生成表用途、字段语义等结构化结果并保存状态；文档任务将适用的表说明投影到索引内容，界面已有结果展示。生成结果可在重试时复用，来源或配置过期的结果不能直接发布。
- Vector / Hybrid 检索会为适用行结果补充有效表上下文；纯 Keyword 检索不因此改变。原始行数据保留，不把模型生成的说明伪装为原表值。
- 此能力限适用的原生记录模式，不承诺处理 PDF / Word 表格、外部解析器输出的 Markdown 表格或表单文档模式。记录模式仍不使用普通文本的整套分块参数。

证据：[共用表单][processing-form]、[原生读取入口][document-loader]、[表格记录适配][spreadsheet-document]、[表格元数据服务][table-metadata-service]、[文档处理任务][document-job]、[表上下文检索][table-context]、[检索调用][knowledge-search]、[元数据界面][table-metadata-ui]。

### 3.7 12、13：语言提示与自动 / 结构感知分块已接通

- `chunkLanguageHint` 支持 `auto / Chinese / English`，已保存、继承并进入预览和正式分块。自动语言判断使用受限采样的自然语言统计，不调用模型；中文、英文和混合内容影响自然句子边界。
- 语言提示不翻译正文，不改变用户显式分隔符，不取消字符 / Token 上限，也不是新的解析引擎。
- 已注册 `auto` 和 `structure-aware`。自动策略根据正文格式和标题、表格、列表、代码等结构，在结构分块、Markdown 标题分块和递归文本分块间确定性选择，并记录选择结果。
- 自动 / 结构感知策略属于普通分块结构，不自动把知识库变为父子结构；输入缺少结构信息时按实际文本处理，不能保证恢复解析阶段已经丢失的表格或阅读顺序。
- 公共结构分块已有短说明与后续表格的合并处理，仅在来源和大小 / Token 条件允许时生效，超限仍拆分。功能状态已接通，具体检索质量不在本次核查范围。

证据：[共用表单][processing-form]、[共用切分][split-documents]、[语言检测][chunk-language]、[自动策略][auto-splitter]、[结构策略][structure-splitter]、[结构分块][structure-chunks]。

### 3.8 15：自动标签已接通

- 知识库保存 `automaticTagging` 配置，服务端归一化并校验；不再使用只存在于弹窗内的 `automaticTaggingEnabled` 开关。
- 原文处理完成后通过独立标签任务执行，选择配置模型或适用的知识库模型；只从当前知识库已有标签候选中分类，不自动创建标签。
- 写入前检查文档版本、标签修订与当前配置；保留人工标签，是否允许为已有人工标签的文档追加自动标签由配置控制。
- 相同输入使用哈希避免重复工作，标签关联写入保持幂等。标签派生任务与源文档处理分开，不能用源文档“完成”代表标签已生成。

证据：[知识库保存][dialog-ts]、[配置校验][tag-config]、[后台任务][tag-job]、[分类服务][tag-service]、[标签关联服务][knowledge-tag-service]。

### 3.9 第二批解析器与扫描页后处理

- 宿主已提供 Sandbox Jobs 所需的文件作用域、Python 文档 Runtime、解析错误分类与逐页覆盖诊断；它们是插件执行基础，不是新的 PDF 算法。
- PDFium / MarkItDown 的知识库转换适配与 rag-vlm 修改在插件 #631；需使用匹配宿主、插件包与 Runtime 的版本。不能因为宿主 PR 已合并就声称部署环境已有新插件。
- 对有明确 `pdf_page + vlm` 标记的扫描页转录，宿主先规范为文本，再复用文档分块策略与 Token 限制；汇总后整理顺序并保留父子关系。普通插图不自动按扫描页转录处理。
- 页面诊断用于区分已提取文字、空白、需要 OCR 和已识别；“任务完成”不自动等于所有页面内容完整。没有正确页面图像或视觉模型时，不能声称扫描页已经识别。
- AnyDoc 已将扫描页渲染为 `pdf_page` 资产并接入上述流程；OpenDataLoader 扫描页使用任务内本地 OCR，普通图片继续走共用图像理解。内置 VLM 与外部 rag-vlm 都过滤占位图片；页面覆盖及图片识别警告分别展示。

证据：[正式加载][document-loader]、[解析诊断][parser-diagnostics]、[Runtime 清单][runtime-catalog]、[Python Runtime 定义][python-runtime]、[插件 #631](https://github.com/xpert-ai/xpert-plugins/pull/631)。

## 4. 仍未实现 / 未开放的功能与后续计划

### 4.1 原设置编号中的剩余项

沿用原编号；09–16 已全部移到第 3 节说明实现与边界。同步后的 develop 已包含 18 的 FAQ 语义反例排除，本批不重复提交该功能；剩余 17、19、20 仍未开放。

| 编号 | 功能             | 当前缺口与后续边界                                             |
| ---- | ---------------- | -------------------------------------------------------------- |
| 17   | 音频入库配置     | ASR 入口未接通；平台语音能力不能替代知识库转写、索引及重试链路 |
| 19   | 按库选择文件存储 | 当前使用平台默认存储；属于产品和迁移能力扩展                   |
| 20   | 按库选择向量存储 | 当前使用系统默认；需要索引重建、切换和失败恢复方案             |

证据：[共用设置模板][processing-html]、[知识库弹窗逻辑][dialog-ts]及[模板][dialog-html]、[知识库服务][knowledgebase-service]。

### 4.2 新增解析器计划

| 计划                      | 拟接入范围                                              | 执行环境与边界                                                                                |
| ------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 第三批 AnyDoc             | 独立文档插件，支持格式与验收矩阵见解析器计划第 6 节     | 已实现 Node Runtime 与本地分页渲染；扫描内容由知识库视觉模型转录，不调用 Firecrawl hosted OCR |
| 第四批 OpenDataLoader PDF | 独立 PDF 插件，输出 Markdown、JSON、图片                | 已实现 Java 17 / CLI Runtime 与本地 CPU Hybrid OCR；默认置信度 0.5，可配置                    |
| 第五批按需扩展            | 更多 OCR 语言、GPU / 远端后端、特殊格式、音频等实际缺口 | 不列为第三、四批的默认交付范围；不自动增加服务或修改公共分块算法                              |

详细模块分工、依赖管理和验收用例以[解析器实施计划][parser-plan]为准；本文件只汇总功能状态。本地受管 Runtime 已安装并有转换验证，生产 OCI 镜像构建发布、平台兼容性与部署绑定仍需完成。

## 5. 验证说明与后续验收

本批已运行宿主表单、解析配置、图片理解、Runtime 及插件转换等定向测试，并核对本地样例重处理结果；提交前追加检查 Slider、多语种提示和导入配置。未自动打开浏览器，也未完成生产镜像与全部格式的端到端验收。单个样例成功和历史测试数量不作为完整验收结论。

已有定向测试覆盖位置：

- `processing-form.spec.ts`、`processing-settings.component.spec.ts`、`import-model.spec.ts`：共用表单、校验、配置投影与导入。
- `parser-config.spec.ts`、`parser-settings.service.spec.ts`、`load.handler.spec.ts`：默认继承、服务端校验、预览和加载。
- `split-documents.spec.ts`、`token-limited-chunks.spec.ts`、`tokenizer.spec.ts`：切分与 Token 上限、多语言和父子块边界。
- `questions/*.spec.ts`、`retrieval/question-retrieval.spec.ts`、`chunk-questions.component.spec.ts`：问题生成、空结果、失败、派生向量、检索与界面。
- `chunk-language*.spec.ts`、`structured-strategies.spec.ts`：语言边界、自动选择和结构分块。
- `spreadsheet-document.spec.ts`、`table-metadata*.spec.ts`、`tables/*.spec.ts`、`retrieval/table-context.service.spec.ts`：表头、行来源、元数据生成 / 复用 / 过期及检索消费。
- `tags/automatic-tagging*.spec.ts`、`knowledgebase/tags/*.spec.ts`：候选范围、人工标签保护、重试和关联写入。
- `load-parser-coverage.spec.ts`、`parser-diagnostics.spec.ts`、`transform-snapshot.service.spec.ts`：解析器记录、页面覆盖、OCR 补分块和快照复用。Sandbox Runtime 与插件本身的验收另见解析器计划。

后续真实验收重点：

1. 保存后重新打开值一致；新文档继承库级默认，文档显式覆盖优先，已有分块结构不被改变。
2. TXT / Markdown 预览与正式入库在相同配置下结果一致；Token 超限文本、中文和父子子块符合上限。
3. PDF 策略使用实际可用插件；图片关闭不调用视觉模型，开启时模型与提示词实际生效。
4. 问题生成配置保存后触发后台处理；验证成功、空结果、失败重试、重新生成、删除和来源变化后的检索过滤。
5. 历史文档更新配置后的重处理行为明确，问题生成失败不阻塞源文档读取，FAQ 现有约束保持一致。
6. 混合格式上传真正按后缀路由；图片类不支持的格式显示默认处理范围，显式插件故障不静默回退。
7. CSV / Excel 表头开关影响实际记录；字段变更后索引字段正确，表格元数据要求进入模型调用，结果用于展示及 Vector / Hybrid 上下文。
8. 自动标签只选择库内已有标签，人工操作和文档重处理后旧任务不覆盖新状态；语言提示和自动分块在预览、正式执行及 OCR 补分块中一致。
9. 第二批插件 #631 合并发布后，核对安装级别、实际加载版本、受管 Runtime、取消 / 超时及已有工具入口；第三、四批分别执行解析器计划中的独立验收用例。

## 6. 源码索引

链接以仓库相对路径保存，不依赖容易变化的行号。

[parser-plan]: ./knowledgebase-parser-implementation-plan.md
[dialog-ts]: ../apps/cloud/src/app/features/xpert/knowledge/new/new.component.ts
[dialog-html]: ../apps/cloud/src/app/features/xpert/knowledge/new/new.component.html
[processing-form]: ../apps/cloud/src/app/features/xpert/knowledge/processing/processing-form.ts
[processing-html]: ../apps/cloud/src/app/features/xpert/knowledge/processing/processing-settings.component.html
[parser-rows]: ../apps/cloud/src/app/features/xpert/knowledge/processing/parser-engine-rows.ts
[import-model]: ../apps/cloud/src/app/features/xpert/knowledge/knowledgebase/documents/import/import-model.ts
[chunk-preview]: ../apps/cloud/src/app/features/xpert/knowledge/new/chunk-preview.component.ts
[parser-config]: ../packages/server-ai/src/knowledge-document/parser-config.ts
[parser-settings]: ../packages/server-ai/src/knowledgebase/parser-settings.service.ts
[document-loader]: ../packages/server-ai/src/knowledge-document/commands/handlers/load.handler.ts
[split-documents]: ../packages/server-ai/src/knowledge-document/split-documents.ts
[token-limit]: ../packages/server-ai/src/knowledge-document/token-limited-chunks.ts
[tokenizer]: ../packages/plugin-sdk/src/lib/ai-model/utils/tokenizer.ts
[vlm-strategy]: ../packages/plugins/vlm-default/src/lib/vlm.strategy.ts
[knowledgebase-service]: ../packages/server-ai/src/knowledgebase/knowledgebase.service.ts
[derived-publication]: ../packages/server-ai/src/knowledge-document/derived-index-publication.service.ts
[question-service]: ../packages/server-ai/src/knowledge-document/questions/question-generation.service.ts
[question-controller]: ../packages/server-ai/src/knowledge-document/questions/question-generation.controller.ts
[question-vectors]: ../packages/server-ai/src/knowledge-document/questions/question-vectors.ts
[vector-retriever]: ../packages/server-ai/src/knowledgebase/retrieval/vector-knowledge-candidate.retriever.ts
[question-ui]: ../apps/cloud/src/app/features/xpert/knowledge/knowledgebase/documents/chunk/chunk-questions.component.ts
[parser-contract]: ../packages/contracts/src/ai/knowledge-parser.model.ts
[transform-snapshot]: ../packages/server-ai/src/knowledge-document/transform-snapshot.service.ts
[spreadsheet-document]: ../packages/server-ai/src/knowledge-document/spreadsheet-document.ts
[table-metadata-service]: ../packages/server-ai/src/knowledge-document/tables/table-metadata.service.ts
[document-job]: ../packages/server-ai/src/knowledge-document/document.job.ts
[table-context]: ../packages/server-ai/src/knowledgebase/retrieval/table-context.service.ts
[knowledge-search]: ../packages/server-ai/src/knowledgebase/queries/handlers/knowledge-search.handler.ts
[table-metadata-ui]: ../apps/cloud/src/app/features/xpert/knowledge/knowledgebase/documents/chunk/table-metadata.component.ts
[chunk-language]: ../packages/server-ai/src/knowledge-document/chunk-language.ts
[auto-splitter]: ../packages/server-ai/src/knowledgebase/plugins/textsplitter-common/auto.strategy.ts
[structure-splitter]: ../packages/server-ai/src/knowledgebase/plugins/textsplitter-common/structure-aware.strategy.ts
[structure-chunks]: ../packages/server-ai/src/knowledgebase/plugins/textsplitter-common/structure-chunks.ts
[tag-config]: ../packages/server-ai/src/knowledgebase/tags/automatic-tagging-config.ts
[tag-job]: ../packages/server-ai/src/knowledge-document/tags/automatic-tagging.job.ts
[tag-service]: ../packages/server-ai/src/knowledge-document/tags/automatic-tagging.service.ts
[knowledge-tag-service]: ../packages/server-ai/src/knowledgebase/tags/knowledge-tag.service.ts
[parser-diagnostics]: ../packages/server-ai/src/knowledge-document/parser-diagnostics.ts
[runtime-catalog]: ../packages/sandbox-runtime/images/catalog.json
[python-runtime]: ../packages/server-ai/src/sandbox/sandbox-job/runtime-definitions/document-python-3.12-v1.json
