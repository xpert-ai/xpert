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