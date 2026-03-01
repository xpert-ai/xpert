# Server AI

`Server AI` is an AI functionality project built on top of the server-core's basic features, aimed at providing developers with a comprehensive artificial intelligence solution. The goal of `Server AI` is to simplify the development process of AI applications, allowing developers to focus on implementing business logic without having to worry too much about underlying technical details.

Core Modules:

- **Copilot**: Provides basic AI model functionalities, such as model configuration, access statistics, and model memory.
- **Chat**: Offers functionality for recording conversations with agents.
- **Xpert**: Provides a platform for orchestrating multiple intelligent agents.
- **Knowledge**: Offers various types of knowledge base functionalities.
- **Integration**: Provides integration capabilities with various third-party platforms.

## Handoff queue e2e test

The e2e spec for `EnqueueAgentChatMessageCommand` uses a real Redis/Bull queue and loads sensitive values from an env file.

1. Copy `packages/server-ai/.env.e2e.example` to `packages/server-ai/.env.e2e.local` and fill in your Redis credentials.
2. Run the test:

```bash
pnpm nx test server-ai --testPathPattern=enqueue-agent-chat-message.handler.e2e.spec.ts
```

You can override env file path with `SERVER_AI_E2E_ENV_PATH`.
