# @xpert-ai/plugin-integration-lark

Lark (Feishu) integration plugin for Xpert AI platform.

## Features

- Bidirectional messaging with Lark (Feishu) platform
- Webhook event handling (messages, card actions)
- Send text, markdown, and interactive card messages
- @mention detection in group chats
- Message update support (streaming)
- Middleware built-in notify tools (`LarkNotifyMiddleware`)

## Installation

This plugin is loaded automatically when placed in the plugins directory.

## Configuration

Configure the Lark integration in the Xpert AI admin panel:

- **App ID**: Your Lark app ID
- **App Secret**: Your Lark app secret
- **Verification Token**: Token for webhook verification
- **Encrypt Key**: Key for message encryption (optional)
- **Is Lark**: Set to true for international Lark, false for Feishu (China)

## Webhook URL

```
POST /api/lark/webhook/:integrationId
```

## Migration

- `feishu_create_message` (builtin `feishu_message` toolset in `server-ai`) is deprecated.
- Use `LarkNotifyMiddleware` tools instead:
  - `lark_send_text_notification`
  - `lark_send_rich_notification`
  - `lark_update_message`
  - `lark_recall_message`
  - `lark_list_users`
  - `lark_list_chats`
- `integrationId` is resolved from middleware config only (`configSchema.integrationId`).
- Send targets are resolved from `configSchema.recipients` only.
- `recipients[].id` supports runtime state variable paths (for example: `runtime.chatId`).
- Runtime state variables can still be injected via Mustache templates (for example: `{{channel.foo}}`).

## License

AGPL-3.0
