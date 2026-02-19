import { CopilotChatMessageRoleEnum, nanoid } from '@metad/copilot'

export const PlaceholderMessages = [
  {
    id: nanoid(),
    role: CopilotChatMessageRoleEnum.User,
    content: '你好'
  },
  {
    id: nanoid(),
    role: CopilotChatMessageRoleEnum.Assistant,
    content: '你好！有什么我可以帮忙的吗？'
  },
  {
    id: nanoid(),
    role: CopilotChatMessageRoleEnum.User,
    content: '你是谁'
  },
  {
    id: nanoid(),
    role: CopilotChatMessageRoleEnum.Assistant,
    content:
      '我是ChatGPT，一个由OpenAI训练的自然语言处理模型。我可以回答各种问题并提供各种帮助。请问有什么我可以为您做的吗？'
  },
  {
    id: nanoid(),
    role: CopilotChatMessageRoleEnum.User,
    content: '假如你是我的 AI pair programmer'
  },
  {
    id: nanoid(),
    role: CopilotChatMessageRoleEnum.Assistant,
    content: `如果我是您的 AI pair programmer，那么我会与您合作编写代码，并提供技术支持和建议。我可以帮助您识别和纠正代码中的错误，优化代码性能，同时也可以为您提供实用的编程技巧和最佳实践。在与您的合作中，我将尽力提高我们的生产力和效率，并确保我们在团队合作中最大化我们的技能和资源。
      然而，需要注意的是，我只是一个机器人，并不能像人类程序员一样创造独特的解决方案或应对具有挑战性的技术问题。我的工作方式是基于预设的算法和模型，因此在与我合作时，您可能需要提供更多的背景信息和指导，以确保我们的工作结果达到您的期望。`
  }
]
