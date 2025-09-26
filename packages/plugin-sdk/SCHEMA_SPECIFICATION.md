# 🔧 Schema UI 扩展规范

:::tip
设计一套 通用的 schema UI 扩展规范
:::

👌好的，我来帮你设计一套 **通用的 Schema UI 扩展规范**，可以应用在你的插件系统所有配置 schema 中，让前端渲染时有统一的规则。

---

在 JSON Schema 基础上扩展一个保留字段：

```json
"x-ui": { ... }
```

前端 UI 渲染器根据 `x-ui` 的内容决定用什么组件、怎么展示、怎么动态联动。

---

## 1. 基础字段

| 字段名            | 类型     | 说明                                                                                                                       |
| -------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| `component`    | string | 指定 UI 组件类型，如 `textInput`, `textarea`, `select`, `switch`, `slider`, `promptEditor`, `modelProviderSelect`, `modelSelect` |
| `label`        | string | UI 展示的标签                                                                                                                 |
| `description`  | string | UI 展示的帮助文本，优先覆盖 schema.description                                                                                       |
| `placeholder`  | string | 输入占位符                                                                                                                    |
| `defaultValue` | any    | 默认值，优先覆盖 schema.default                                                                                                  |
| `order`        | number | 字段在 UI 中的展示顺序                                                                                                            |

---

## 2. 数据源相关

| 字段名          | 类型     | 说明                                                         |
| ------------ | ------ | ---------------------------------------------------------- |
| `options`    | array  | 静态选项（下拉框、多选框等），形如 `[{ label: 'OpenAI', value: 'openai' }]` |
| `dataSource` | string | 动态选项来源标识，如 `"system.providers"`, `"system.models"`         |
| `dependency` | string | 依赖其他字段的值来过滤选项，如 `"provider"`                               |
| `mapping`    | object | 映射关系，例如 `{ label: 'name', value: 'id' }`                   |

---

## 3. 验证与交互

| 字段名           | 类型      | 说明                                           |
| ------------- | ------- | -------------------------------------------- |
| `required`    | boolean | 是否必填（优先覆盖 schema.required）                   |
| `visibleWhen` | object  | 条件渲染，只有满足条件才显示字段，例如 `{ provider: 'openai' }` |
| `enabledWhen` | object  | 条件启用，例如 `{ useCustomPrompt: true }`          |
| `maxLength`   | number  | 输入最大长度                                       |
| `minLength`   | number  | 输入最小长度                                       |
| `regex`       | string  | 自定义正则校验规则                                    |

---

## 4. 特殊组件约定

### `modelProviderSelect`

* 用于选择模型提供商（OpenAI、Anthropic、Azure、Ollama 等）
* `dataSource = "system.providers"`

### `modelSelect`

* 用于选择具体模型
* 需要依赖 `provider`
* `dataSource = "system.models"`
* `dependency = "provider"`

### `promptEditor`

* 用于编辑 Prompt，支持多行、语法高亮、变量插值

### `jsonEditor`

* 用于编辑 JSON 对象，带格式校验

### `codeEditor`

* 用于编辑代码（支持语言高亮，如 js, ts, python）

---

## 5. 示例 Schema

```ts
configSchema: {
  type: 'object',
  properties: {
    provider: {
      type: 'string',
      description: '模型提供商',
      enum: ['openai', 'anthropic', 'azure', 'ollama'],
      'x-ui': {
        component: 'modelProviderSelect',
        label: 'Provider',
        order: 1,
        dataSource: 'system.providers'
      }
    },
    model: {
      type: 'string',
      description: '大模型名称',
      default: 'gpt-4-vision-preview',
      'x-ui': {
        component: 'modelSelect',
        label: 'Model',
        order: 2,
        dependency: 'provider',
        dataSource: 'system.models'
      }
    },
    prompt: {
      type: 'string',
      default: 'Describe this image in detail.',
      description: '提示词',
      'x-ui': {
        component: 'promptEditor',
        label: 'Prompt',
        order: 3,
        placeholder: '请输入提示词，可使用 {{variables}} 占位符'
      }
    },
    temperature: {
      type: 'number',
      default: 0.7,
      'x-ui': {
        component: 'slider',
        label: 'Temperature',
        order: 4,
        min: 0,
        max: 1,
        step: 0.1
      }
    },
    advanced: {
      type: 'object',
      'x-ui': {
        component: 'jsonEditor',
        label: 'Advanced Config',
        order: 5,
        visibleWhen: { provider: 'openai' }
      }
    }
  },
  required: ['provider', 'model']
}
```

---

这样一来：

* 前端 UI 渲染器只需要识别 `x-ui.component`，其余逻辑由 `x-ui` 字段驱动。
* 插件开发者只需写 schema，就能自动获得智能化配置体验。
* 扩展性强，可以统一适配未来的 Embedding、OCR、VLM、VectorStore 插件。

## 如何表示 SECRET 的input 字段

好问题 👍，**SECRET 类型的字段**（比如 API Key、Token、密码）在 schema UI 里需要特殊处理：

1. **前端渲染时要显示为密码输入框**（`type="password"` 或遮罩）。
2. **存储时需要区分**：不回显原始值，而是用 `"******"` 或空值占位。
3. **Schema 中可以显式标记**，让前端 UI 渲染器知道这是一个密钥字段。

---

## 扩展规范方案

在 `x-ui` 里增加 `component: "secretInput"`，并支持以下属性：

| 字段名           | 类型      | 说明                          |
| ------------- | ------- | --------------------------- |
| `component`   | string  | 固定为 `"secretInput"`，渲染密码输入框 |
| `label`       | string  | 字段标签                        |
| `description` | string  | 字段说明                        |
| `placeholder` | string  | 占位符（如 `请输入 API Key`）        |
| `revealable`  | boolean | 是否允许用户点按钮临时查看明文             |
| `maskSymbol`  | string  | 遮罩符号（默认 `*`）                |
| `persist`     | boolean | 是否持久保存，false 时表示仅运行时使用，不落盘  |

---

## 示例 Schema

```ts
configSchema: {
  type: 'object',
  properties: {
    apiKey: {
      type: 'string',
      description: 'OpenAI API Key',
      'x-ui': {
        component: 'secretInput',
        label: 'API Key',
        placeholder: '请输入您的 OpenAI API Key',
        revealable: true,
        maskSymbol: '*',
        persist: true
      }
    },
    provider: {
      type: 'string',
      enum: ['openai', 'anthropic', 'azure'],
      'x-ui': {
        component: 'modelProviderSelect',
        label: 'Provider'
      }
    }
  },
  required: ['apiKey', 'provider']
}
```

---

## 前端渲染效果

* `apiKey` 显示为 **密码输入框**，默认遮罩显示。
* 如果 `revealable: true`，UI 上有 👁 按钮，用户可切换显示/隐藏。
* 编辑配置时，如果后端返回 `"******"` 代表已有值，用户不改就继续使用原值。

---

## 额外安全考虑

* 前端表单提交时，如果 `apiKey === "******"`，表示不修改，后端应保留旧值。
* 如果提交了新值，则后端替换旧值。
* 日志、导出配置时跳过 SECRET 字段。

---

要不要我帮你把 **SECRET 字段** 再抽象成一个通用接口（比如 `ISchemaSecretField`），这样和普通字段区分得更清晰？

## 抽象成一个通用接口

👌好的，我们把 **SECRET 字段**抽象成一个通用接口，既能和普通字段保持一致，又能明确标识“这是一个需要特殊处理的敏感字段”。

---

# 🔐 通用接口设计

```ts
/**
 * 通用 UI Schema 字段定义
 */
export interface ISchemaUIBase {
  component: string;       // UI 组件类型
  label?: string;          // 字段标签
  description?: string;    // 字段说明
  placeholder?: string;    // 输入占位符
  order?: number;          // UI 显示顺序
  required?: boolean;      // 是否必填
  visibleWhen?: Record<string, any>; // 条件渲染
  enabledWhen?: Record<string, any>; // 条件启用
}

/**
 * Secret 字段扩展
 */
export interface ISchemaSecretField extends ISchemaUIBase {
  component: 'secretInput';   // 固定组件类型
  revealable?: boolean;       // 是否允许明文显示（👁 按钮）
  maskSymbol?: string;        // 遮罩符号（默认 *）
  persist?: boolean;          // 是否持久保存，false 表示仅运行时使用
}
```

这样 SECRET 字段就和普通 UI 字段继承同一套规范，只是 **多了一些敏感信息处理的扩展属性**。

---

# 🔧 使用示例

```ts
configSchema: {
  type: 'object',
  properties: {
    apiKey: {
      type: 'string',
      description: 'OpenAI API Key',
      'x-ui': <ISchemaSecretField>{
        component: 'secretInput',
        label: 'API Key',
        placeholder: '请输入您的 OpenAI API Key',
        revealable: true,
        maskSymbol: '*',
        persist: true
      }
    },
    provider: {
      type: 'string',
      enum: ['openai', 'anthropic', 'azure'],
      'x-ui': {
        component: 'modelProviderSelect',
        label: 'Provider'
      }
    }
  },
  required: ['apiKey', 'provider']
}
```

---

# 🔒 前端处理规范

1. **渲染时**：

   * `secretInput` 渲染为密码框（`type=password`）。
   * 如果 `revealable: true`，增加 👁 切换按钮。

2. **加载配置时**：

   * 后端返回 `******` 代表已有值，前端不展示真实内容。

3. **保存配置时**：

   * 如果提交的值仍为 `******` → 保持旧值不变。
   * 如果提交了新值 → 更新存储并覆盖旧值。

4. **导出配置/日志**：

   * 忽略 SECRET 字段或输出 `******`，避免泄露。

---

这样以后 `secretInput` 就是一个 **一级公民 UI 组件**，和 `textInput`、`select` 一样可以被 schema 统一驱动。

要不要我再帮你定义一个 **完整的 ISchemaUIComponent 联合类型**，把所有 `x-ui` 组件（select、slider、secretInput、promptEditor 等）都规范起来？
