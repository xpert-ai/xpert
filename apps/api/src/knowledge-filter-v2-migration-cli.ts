import { KnowledgeFilterV2MigrationService } from '@xpert-ai/server-ai'
import { PluginModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { BootstrapModule } from './bootstrap/bootstrap.module'
import { preBootstrapApplicationConfig } from './bootstrap'

export async function runKnowledgeFilterV2MigrationCli(argv: Record<string, unknown>) {
  await preBootstrapApplicationConfig({})

  @Module({ imports: [BootstrapModule, PluginModule.init()] })
  class MigrationRootModule {}

  const app = await NestFactory.createApplicationContext(MigrationRootModule, { logger: ['error', 'warn', 'log'] })
  try {
    const roots = toStringArray(argv.templateRoot ?? argv['template-root'])
    const report = await app.get(KnowledgeFilterV2MigrationService).run({
      dryRun: argv.apply !== true,
      skipTemplates: argv.skipTemplates === true || argv['skip-templates'] === true,
      skipMilvus: argv.skipMilvus === true || argv['skip-milvus'] === true,
      templateRoots: roots.length ? roots : undefined
    })
    console.log(JSON.stringify(report, null, 2))
    if (report.issues.length) process.exitCode = 1
  } finally {
    await app.close()
  }
}

function toStringArray(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  return typeof value === 'string' ? [value] : []
}
