# @xpert-ai/plugin-integration-lark

Lark (Feishu) integration plugin for Xpert AI platform.

## Features

- Bidirectional messaging with Lark (Feishu) platform
- Webhook event handling (messages, card actions)
- Send text, markdown, and interactive card messages
- @mention detection in group chats
- Message update support (streaming)

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

## License

AGPL-3.0
