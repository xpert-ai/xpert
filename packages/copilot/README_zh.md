# ❌（已弃用）Metad AI Copilot

❌ !已弃用，请使用 [ChatKit](https://github.com/xpert-ai/chatkit-js) 代替。

[English](./README.md) | 中文

`@metad/copilot` 是一个通用的抽象核心逻辑包，专为开发 AI Copilot 应用而设计。
它提供了一组灵活的工具和功能，使您能够快速构建并集成 Copilot 功能，而无需关注具体的用户界面框架。

## 安装

通过 npm 安装 `@metad/copilot`：

```bash
npm install @metad/copilot
```

## 在 Angular 中使用

`@metad/ocap-angular` 是一个为 Angular 框架设计的 UI 组件库。其中 `@metad/ocap-angular/copilot` 是 Copilot chat UI 组件，它建立在 `@metad/copilot` 的基础之上，旨在帮助用户在 Angular 应用中轻松地集成和构建 Copilot 聊天功能。

### 安装

通过 npm 安装 `@metad/ocap-angular`：

```bash
npm install @metad/ocap-angular
```

### 配置

在使用 Copilot 组件前需要提供配置参数。您可以通过 `provideClientCopilot` 函数并传入 AI API 参数来提供。

```typescript
import { provideClientCopilot } from '@metad/ocap-angular/copilot'
import { provideMarkdown } from 'ngx-markdown'

export const appConfig: ApplicationConfig = {
  providers: [
    provideClientCopilot(async () =>
      ({
        enabled: true,
        chatUrl: '',
        modelsUrl: '',
        apiKey: 'sk-xxxxxxx',
        provider: "openai",
      })
    ),
    provideMarkdown()
  ],
};
```

### 使用

在您的 Angular 应用中引入 `@metad/ocap-angular/copilot` 模块：

```typescript
import {
  NgmCopilotChatComponent,
  injectCopilotCommand,
  injectMakeCopilotActionable,
} from '@metad/ocap-angular/copilot';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NgmCopilotChatComponent],
})
export class AppComponent { }
```

在您的组件模板中使用 Copilot Chat 组件：

```html
<ngm-copilot-chat></ngm-copilot-chat>
```

这样 Copilot Chat 基础聊天功能便可以使用了。

### 功能

还提供了两个函数用于自定义命令来执行特定的操作：

- `injectCopilotCommand` Inject custom commands
- `injectMakeCopilotActionable` Inject the callable function of the custom command


### injectCopilotCommand

| Property | Example | Description |
|------|------|------|
| `name` | 'form' | The unique identifier of the custom command, which is used to identify the command in front of the Copilot dialog prompt |
| `description` | 'Descripe how to fill the form' | Describes how to use this command, prompting the user how to write the prompt |
| `examples` | `['A', 'B']` | Examples of how to write the prompt for this command, which helps the user to quickly enter the prompt |
| `actions` | `[]` | The operation function implementation available for this command, if not specified, all operation functions in the current context will be used |

### injectMakeCopilotActionable

| Property | Example | Description |
|------|------|------|
| `name` | 'fill_form' | The unique identifier of the operation function, which is used by the AI to identify the call to this function |
| `description` | 'Fill the form' | Describes the function |
| `argumentAnnotations` | `[]` | The definition of the input parameters of the function |
| `implementation` | `async function` | The implementation logic of the function, returning no value or returning a string will end the command session, returning Message will continue the command session |

argumentAnnotations:

| Property | Example | Description |
|------|------|------|
| `name` | 'form' | The name of the input parameter |
| `type` | 'string' | The type of the parameter |
| `description` | 'The form to fill' | The description of the parameter |
| `required` | `true` | Whether the parameter is required |
| `properties` | `[]` | The property definition of the input parameter of the function |

For the `properties` attribute, you can define it directly or use the [zod](https://zod.dev/) library for definition, for example:

```ts
import { z, ZodType, ZodTypeDef } from 'zod'
import zodToJsonSchema from 'zod-to-json-schema'

{
    properties: (<{ properties: any }>zodToJsonSchema(z.object({
                title: z.string().describe('The title of form'),
                desc: z.string().description('My Milestone Work Objectives'),
                standard: z.string().description('My Satisfaction Measurement Standard'),
              }))).properties
}
```

### 演示用例

自定义一个可以提供建议链接的命令：

```typescript
#askCommand = injectCopilotCommand({
    name: 'help',
    description: 'Help',
    examples: [
      'Show helps for angular',
      'Show helps for react',
      'Show helps for vue',
    ],
    actions: [
      injectMakeCopilotActionable({
        name: 'show-help',
        description: 'Show helps',
        argumentAnnotations: [
          {
            name: 'helps',
            description: 'Helps for the commands',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'The title of help link',
                },
                link: {
                  type: 'string',
                  description: 'The url of help link',
                },
              },
            } as any,
            required: true,
          },
        ],
        implementation: async (helps: Link[]) => {
          this.helps.set(helps)
          return `Command finish!`
        },
      }),
    ],
  });
```

Copilot框架提供了一个演示项目，您可以参考其实现方式：

https://stackblitz.com/~/github.com/tiven-w/metad-copilot-demo

## 贡献

如果您发现任何问题或有改进建议，请随时提出问题或提交拉取请求。我们欢迎并鼓励社区的贡献。

## 许可

`@metad/copilot` 是基于 MIT 许可发布的。有关更多信息，请参阅 [LICENSE](./LICENSE) 文件。

## 联系我们

如果您有任何疑问或需要进一步的帮助，请随时通过电子邮件联系我们：<mailto:service@xpertai.cn>

谢谢您使用 `@metad/copilot`！我们期待看到您的 Copilot 应用取得成功。