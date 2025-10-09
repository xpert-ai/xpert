import { Endpoints } from "@octokit/types";
import { IIntegration, IntegrationEnum, TIntegrationProvider } from '../integration.model';


export const IntegrationGitHubProvider: TIntegrationProvider = {
  name: IntegrationEnum.GITHUB,
  label: {
    en_US: 'GitHub',
    zh_Hans: 'GitHub'
  },
  description: {
    en_US: 'GitHub is a proprietary developer platform that allows developers to create, store, manage, and share their code. It uses Git to provide distributed version control and GitHub itself provides access control, bug tracking, software feature requests, task management, continuous integration, and wikis for every project.',
    zh_Hans: 'GitHub 是一个专有的开发者平台，允许开发者创建、存储、管理和分享他们的代码。它使用 Git 提供分布式版本控制，GitHub 本身为每个项目提供访问控制、错误跟踪、软件功能请求、任务管理、持续集成和知识。'
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
            description: 'The Client Secret of the GitHub App'
        },
        privateKey: {
            type: 'textarea',
            description: 'The private key of the GitHub App'
        },
        webhookSecret: {
            type: 'string',
            description: 'The webhook secret of the GitHub App'
        }
    }
  },
  // webhookUrl: (integration: IIntegration, baseUrl: string) => {
  //   return `${baseUrl}/api/github/${integration.id}/webhook`
  // }
}

export type TGithubAuth = {
  redirectUri: string;
  integrationId: string;
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
  token_type: string;
  scope: string;
  installation_token: string;
  repository: string
};

type GitHubInstallationsResponse =
  Endpoints["GET /user/installations"]["response"]["data"];
type GitHubInstallation = GitHubInstallationsResponse["installations"][0];

export interface Installation {
  id: number;
  accountName: string;
  accountType: "User" | "Organization";
  avatarUrl: string;
}

/**
 * Transform GitHub API installation data to our simplified format
 */
export const transformInstallation = (
  installation: GitHubInstallation,
): Installation => {
  if (!installation.account) {
    throw new Error("Installation account is null");
  }

  // Handle both User and Organization account types
  let accountName: string;
  if ("login" in installation.account && installation.account.login) {
    accountName = installation.account.login;
  } else if ("slug" in installation.account && installation.account.slug) {
    accountName = installation.account.slug;
  } else if ("name" in installation.account && installation.account.name) {
    accountName = installation.account.name;
  } else {
    accountName = "Unknown";
  }

  const accountType = installation.target_type as "User" | "Organization";

  return {
    id: installation.id,
    accountName,
    accountType,
    avatarUrl: installation.account.avatar_url,
  };
};

export type TRepositoryReturn = {
  repositories: Repository[]
  pagination: {
    page: number
    perPage: number
    hasMore: boolean
    totalCount: number
  }
}

/**
 * Repository interface representing GitHub repository data
 */
export interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  fork: boolean;
  html_url: string;
  default_branch: string;
  permissions: {
    admin: boolean;
    maintain: boolean;
    push: boolean;
    triage: boolean;
    pull: boolean;
  };
  has_issues: boolean;
}

/**
 * Branch interface representing GitHub branch data
 */
export interface Branch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}
