import { DynamicModule, Type } from '@nestjs/common'
import { TypeOrmModuleOptions } from '@nestjs/typeorm'
// import { PluginDefinition } from 'apollo-server-core';
import { ILogger } from './ILogger'
import type { AppPlatformConfiguration } from '@xpert-ai/contracts'

export interface IGraphqlOptions {
  path: string

  playground: boolean

  debug: boolean

  // apolloServerPlugins?: PluginDefinition[];
}

export interface IAssetOptions {
  assetPath: string
  assetPublicPath: string
  serverRoot: string
  dataPath: string
  /** Optional package root; defaults to dataPath/agent-plugins. */
  agentPluginPath?: string
  /** Optional isolated runtime/staging root for installed plugins. */
  pluginPath?: string
}
export interface IApiServerOptions {
  host?: string

  port: number | string

  baseUrl?: string

  middleware?: any

  graphqlConfigOptions: IGraphqlOptions
}

export interface IAuthOptions {
  expressSessionSecret: string

  userPasswordBcryptSaltRounds: number

  jwtSecret: string
}

export interface IBillingConfiguration {
  /** Membership points currently settle in CNY. Other settlement currencies require a points-policy migration. */
  settlementCurrency: 'CNY'
  /** Units of the settlement currency per one unit of each source currency. Decimal strings preserve configuration precision. */
  exchangeRates: Record<string, string>
}

export interface IPluginConfig {
  appPlatform?: AppPlatformConfiguration | null
  billing?: IBillingConfiguration
  managedQueueOptions?: {
    concurrency: number
    sandboxBrowserConcurrency: number
    autorun: boolean
    prefix: string
  }
  apiConfigOptions: IApiServerOptions

  dbConnectionOptions: TypeOrmModuleOptions

  plugins?: Array<DynamicModule | Type<any>>

  pluginInstallationOptions?: { timeoutMs: number; lockWaitMs: number }

  logger?: ILogger

  authOptions?: IAuthOptions

  sandboxJobOptions?: { globalLimit: number; tenantLimit: number; userLimit: number; capacityPollMs: number }

  assetOptions?: IAssetOptions
}
