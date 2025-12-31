# ❌ (Deprecated) Metad AI Copilot

❌ !Deprecated use [ChatKit](https://github.com/xpert-ai/chatkit-js) instead.

English | [中文](./README_zh.md)

`@metad/copilot` is a general-purpose abstract core logic package designed specifically for developing AI Copilot applications. It provides a flexible set of tools and features that enable you to quickly build and integrate Copilot functionality without having to focus on specific user interface frameworks.

## Installation

Install `@metad/copilot` via npm:

```bash
npm install @metad/copilot
```

## Usage in Angular

`@metad/ocap-angular` is a UI component library designed for the Angular framework. Among them, `@metad/ocap-angular/copilot` is the Copilot chat UI component, built on the foundation of `@metad/copilot`, aiming to assist users in seamlessly integrating and building Copilot chat functionality in Angular applications.

### UI Installation

Install `@metad/ocap-angular` via npm:

```bash
npm install @metad/ocap-angular
```

### Configuration

Before using the Copilot component, you need to provide configuration parameters. You can do this by using the `provideClientCopilot` function and passing in the AI API parameters.

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

### Usage in Components

Introduce the `@metad/ocap-angular/copilot` module into your Angular application:

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

Use the Copilot Chat component in your component template:

```html
<ngm-copilot-chat></ngm-copilot-chat>
```

This way, the basic chat functionality of Copilot Chat can be used.

### Custom Commands

Two functions are also provided for customizing commands to perform specific operations:

- `injectCopilotCommand` Inject custom commands
- `injectMakeCopilotActionable` Inject the callable function of the custom command

#### injectCopilotCommand

| Property | Example | Description |
|------|------|------|
| `name` | 'form' | The unique identifier of the custom command, which is used to identify the command in front of the Copilot dialog prompt |
| `description` | 'Descripe how to fill the form' | Describes how to use this command, prompting the user how to write the prompt |
| `examples` | `['A', 'B']` | Examples of how to write the prompt for this command, which helps the user to quickly enter the prompt |
| `actions` | `[]` | The operation function implementation available for this command, if not specified, all operation functions in the current context will be used |

#### injectMakeCopilotActionable

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

#### Examples

Customize a command that can provide suggestion links:

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

The Copilot framework provides a demo project that you can refer to for its implementation:

https://stackblitz.com/~/github.com/tiven-w/metad-copilot-demo

## Contributing

If you find any issues or have suggestions for improvement, please feel free to raise issues or submit pull requests. We welcome and encourage contributions from the community.

## License

`@metad/copilot` is released under the MIT license. For more information, please refer to the [LICENSE](./LICENSE) file.

## Contact Us

If you have any questions or need further assistance, please feel free to contact us via email at: <mailto:service@xpertai.cn>

Thank you for using `@metad/copilot`! We look forward to seeing your Copilot application succeed.