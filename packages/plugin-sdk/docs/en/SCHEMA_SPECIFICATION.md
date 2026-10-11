# Schema UI Extension Specification

Use a common UI extension across plugin configuration schemas so frontend renderers can apply consistent presentation and interaction rules.

Extend JSON Schema with the reserved `x-ui` field:

```json
"x-ui": { ... }
```

The frontend renderer uses `x-ui` to select components, present fields and apply dynamic dependencies.

---

## 1. Basic fields

| Field          | Type   | Description                                                                                                          |
| -------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| `component`    | string | UI component type, such as `textInput`, `textarea`, `select`, `switch`, `slider`, `prompt-editor`, `ai-model-select` |
| `inputs`       | object | Additional input properties for a custom component                                                                   |
| `label`        | string | Displayed field label                                                                                                |
| `description`  | string | Help text; takes precedence over `schema.description`                                                                |
| `help`         | string | Additional help, displayed as a help icon or tooltip when appropriate                                                |
| `placeholder`  | string | Input placeholder                                                                                                    |
| `defaultValue` | any    | Default value; takes precedence over `schema.default`                                                                |
| `order`        | number | Display order in the UI                                                                                              |

---

## 2. Data sources

| Field        | Type   | Description                                                                                                                |
| ------------ | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `options`    | array  | Static options for selects or multi-selects, such as `[{ label: 'OpenAI', value: 'openai' }]`                              |
| `enumLabels` | object | Map enum values to labels, for example `{ openai: 'OpenAI', azure: 'Azure OpenAI' }`, overriding the displayed enum labels |
| `dataSource` | string | Dynamic option source identifier, such as `"system.providers"`, `"system.models"`                                          |
| `dependency` | string | Another field whose value filters the options, such as `"provider"`                                                        |
| `mapping`    | object | Field mapping, for example `{ label: 'name', value: 'id' }`                                                                |

---

## 3. Validation and interaction

| Field         | Type    | Description                                                                        |
| ------------- | ------- | ---------------------------------------------------------------------------------- |
| `required`    | boolean | Whether the field is required; takes precedence over `schema.required`             |
| `visibleWhen` | object  | Display the field only when conditions match, for example `{ provider: 'openai' }` |
| `enabledWhen` | object  | Enable the field when conditions match, for example `{ useCustomPrompt: true }`    |
| `maxLength`   | number  | Maximum input length                                                               |
| `minLength`   | number  | Minimum input length                                                               |
| `regex`       | string  | Custom regular-expression validation rule                                          |

---

## 4. Specialized components

### `modelProviderSelect`

- Select a model provider, such as OpenAI, Anthropic, Azure or Ollama.
- `dataSource = "system.providers"`

### `modelSelect`

- Select a specific model.
- Depends on `provider`.
- `dataSource = "system.models"`
- `dependency = "provider"`

### `promptEditor`

- Edit prompts with multiline input, syntax highlighting and variable interpolation.

### `jsonEditor`

- Edit JSON objects with format validation.

### `codeEditor`

- Edit code with syntax highlighting, such as JavaScript, TypeScript or Python.

---

## 5. Example schema

```ts
configSchema: {
  type: 'object',
  properties: {
    provider: {
      type: 'string',
      description: 'Model provider',
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
      description: 'Model name',
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
      description: 'Prompt',
      'x-ui': {
        component: 'promptEditor',
        label: 'Prompt',
        order: 3,
        placeholder: 'Enter a prompt; {{variables}} placeholders are supported'
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

With these conventions:

- Renderers select the component from `x-ui.component`; the remaining `x-ui` properties drive its behavior.
- Plugin developers declare a schema to obtain a consistent configuration experience.
- The same conventions can support embedding, OCR, vision-model and vector-store plugins.

## Representing secret input fields

Secret fields, such as API keys, tokens and passwords, need explicit UI handling:

1. Render a password input (`type="password"`) or masked value.
2. Represent a stored secret with `"******"` or an empty placeholder instead of returning its plaintext value.
3. Mark secret fields in the schema so renderers can recognize them.

---

## Secret-field extension

Set `component: "secretInput"` in `x-ui` and support these properties:

| Field         | Type    | Description                                                                       |
| ------------- | ------- | --------------------------------------------------------------------------------- |
| `component`   | string  | Set to `"secretInput"` to render a password input                                 |
| `label`       | string  | Field label                                                                       |
| `description` | string  | Field description                                                                 |
| `placeholder` | string  | Placeholder, such as `Enter API key`                                              |
| `revealable`  | boolean | Whether a button may temporarily reveal the value                                 |
| `maskSymbol`  | string  | Mask character (default: `*`)                                                     |
| `persist`     | boolean | Whether to persist the value; false means runtime-only use without saving to disk |

---

## Example schema

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
        placeholder: 'Enter your OpenAI API key',
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

## Frontend presentation

- Render `apiKey` as a password input, masked by default.
- When `revealable: true`, provide a reveal/hide toggle.
- During editing, `"******"` indicates an existing value. Leaving it unchanged preserves that value.

---

## Secret handling

- When the form submits `apiKey === "******"`, preserve the stored value.
- Replace the stored value when a new value is submitted.
- Omit secret fields from logs and configuration exports.

---

A shared interface such as `ISchemaSecretField` makes secret-specific behavior explicit.

## Shared interface

Secret fields share the base UI contract while declaring the additional handling required for sensitive values.

---

### Interface design

```ts
/**
 * Base UI schema field definition
 */
export interface ISchemaUIBase {
  component: string // UI component type
  label?: string // Field label
  description?: string // Field description
  placeholder?: string // Input placeholder
  order?: number // UI display order
  required?: boolean // Whether the field is required
  visibleWhen?: Record<string, any> // Conditional visibility
  enabledWhen?: Record<string, any> // Conditional enablement
}

/**
 * Secret field extension
 */
export interface ISchemaSecretField extends ISchemaUIBase {
  component: 'secretInput' // Fixed component type
  revealable?: boolean // Whether the reveal button is available
  maskSymbol?: string // Mask character (default: *)
  persist?: boolean // Whether to persist; false means runtime-only use
}
```

Secret fields inherit the same base contract as ordinary fields, with additional properties for handling sensitive data.

---

### Usage example

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
        placeholder: 'Enter your OpenAI API key',
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

### Frontend behavior

1. **Rendering:**
   - Render `secretInput` as a password field (`type=password`).
   - Add a reveal toggle when `revealable: true`.

2. **Loading configuration:**
   - Treat `******` as an existing stored value without displaying the original content.

3. **Saving configuration:**
   - Preserve the stored value when the submitted value remains `******`.
   - Replace the stored value when a new value is submitted.

4. **Exporting configuration or logs:**
   - Omit secret fields or output `******` to avoid disclosure.

---

This makes `secretInput` a first-class, schema-driven UI component alongside `textInput` and `select`.

An `ISchemaUIComponent` union can describe the complete set of supported components, including selects, sliders, secret inputs and prompt editors.
