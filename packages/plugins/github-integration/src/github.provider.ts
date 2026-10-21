import { IntegrationEnum, type TIntegrationProvider } from '@xpert-ai/contracts'

export const IntegrationGitHubProvider: TIntegrationProvider = {
  name: IntegrationEnum.GITHUB,
  label: {
    en_US: 'GitHub',
    zh_Hans: 'GitHub'
  },
  description: {
    en_US:
      'GitHub is a proprietary developer platform that allows developers to create, store, manage, and share their code. It uses Git to provide distributed version control and GitHub itself provides access control, bug tracking, software feature requests, task management, continuous integration, and wikis for every project.',
    zh_Hans:
      'GitHub 是一个专有的开发者平台，允许开发者创建、存储、管理和分享他们的代码。它使用 Git 提供分布式版本控制，GitHub 本身为每个项目提供访问控制、错误跟踪、软件功能请求、任务管理、持续集成和知识。'
  },
  avatar: 'github.svg',
  webhook: true,
  schema: {
    type: 'object',
    properties: {
      appName: {
        type: 'string',
        description: 'The App Name of the GitHub App'
      },
      appSlug: {
        type: 'string',
        description: 'The GitHub App URL identifier, for example code-xpertai'
      },
      appId: {
        type: 'string',
        description: 'The App ID of the GitHub App'
      },
      clientId: {
        type: 'string',
        description: 'The Client ID of the GitHub App'
      },
      clientSecret: {
        type: 'string',
        'x-ui': { component: 'secretInput', revealable: false },
        description: 'The Client Secret of the GitHub App'
      },
      privateKey: {
        type: 'string',
        'x-ui': { component: 'secretInput', revealable: false },
        description: 'The private key of the GitHub App'
      },
      webhookSecret: {
        type: 'string',
        'x-ui': { component: 'secretInput', revealable: false },
        description: 'The webhook secret of the GitHub App'
      }
    },
    secret: ['clientSecret', 'privateKey', 'webhookSecret']
  }
}
