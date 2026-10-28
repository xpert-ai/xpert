import { DynamicModule, Type } from '@nestjs/common'
import { TypeOrmModuleOptions } from '@nestjs/typeorm'
// import { PluginDefinition } from 'apollo-server-core';
import { ILogger } from './ILogger'

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

export interface IPluginConfig {
  /** Cloud URL, inherited from the existing CLIENT_BASE_URL setting. */
  clientBaseUrl?: string
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
