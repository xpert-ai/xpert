import { FileStorageProviderEnum, VectorTypeEnum } from '@metad/contracts'
import {
  IAuth0Config,
  IFacebookConfig,
  IFiverrConfig,
  IGithubConfig,
  IGoogleConfig,
  IKeycloakConfig,
  ILinkedinConfig,
  IMicrosoftConfig,
  ISMTPConfig,
  ITwitterConfig,
  IUnleashConfig,
  IUpworkConfig,
  IDingtalkConfig,
  ILarkConfig,
  IWecomConfig
} from '@metad/server-common'

export type LogLevel = 'verbose' | 'debug' | 'log' | 'warn' | 'error'

/**
 * environment variables that goes into process.env
 */
export interface Env {
  LOG_LEVEL?: LogLevel
  IS_DOCKER?: string
  [key: string]: string
}

export interface FileSystem {
  name: string
}

export interface IPACFeatures {
  [key: string]: boolean
}

/**
 * Server Environment
 */
export interface IEnvironment {
  port: number | string
  host: string
  baseUrl: string
  clientBaseUrl: string

  production: boolean
  /**
   * The name of the environment, e.g. 'dev', 'prod'
   * - dev: Development environment
   * - prod: Production environment
   */
  envName: string

  env?: Env
  pro?: boolean

  secretsEncryptionKey: string
  EXPRESS_SESSION_SECRET: string
  USER_PASSWORD_BCRYPT_SALT_ROUNDS?: number
  JWT_SECRET?: string
  JWT_REFRESH_SECRET?: string
  jwtExpiresIn?: string
  jwtRefreshExpiresIn?: string
  mailVerificationUrl?: string

  fileSystem: FileSystem

  facebookConfig: IFacebookConfig
  googleConfig: IGoogleConfig
  githubConfig: IGithubConfig
  microsoftConfig: IMicrosoftConfig
  linkedinConfig: ILinkedinConfig
  twitterConfig: ITwitterConfig
  fiverrConfig: IFiverrConfig
  keycloakConfig: IKeycloakConfig
  auth0Config: IAuth0Config
  dingtalkConfig: IDingtalkConfig
  larkConfig: ILarkConfig
  wecomConfig: IWecomConfig

  sentry?: {
    dns: string
  }

  defaultHubstaffUserPass?: string
  upworkConfig?: IUpworkConfig
  isElectron?: boolean
  allowSuperAdminRole?: boolean

  smtpConfig?: ISMTPConfig
  defaultCurrency: string

  unleashConfig?: IUnleashConfig

  demo: boolean

  // Rag
  vectorStore?: VectorTypeEnum

  // Sandbox
  sandboxConfig?: {
    /**
     * The Docker image to use for the sandbox environment.
     * It is also used in local development to determine whether to use the docker image to start the sandbox.
     */
    image: string
    network: string
    host: string
    port: string
    volume: string
    expiredTime: number // xxx second
    memory?: number
    cpuShares?: number
    shmSize?: number
    ipcMode?: string
  }
}
