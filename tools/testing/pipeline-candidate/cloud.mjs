// Run the committed production Angular builder directly, without serving or deploying.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { Architect } = require('@angular-devkit/architect')
const { TestingArchitectHost } = require('@angular-devkit/architect/testing')
const { schema, logging } = require('@angular-devkit/core')
const project = JSON.parse(fs.readFileSync('apps/cloud/project.json'))
const target = { project: 'cloud', target: 'build', configuration: 'production' }
const host = new TestingArchitectHost(process.cwd(), process.cwd())
host.getProjectMetadata = async () => ({ root: 'apps/cloud', sourceRoot: project.sourceRoot })
host.addTarget(target, '@angular/build:application', {
  ...project.targets.build.options,
  ...project.targets.build.configurations.production
})
const buildRoot = path.dirname(require.resolve('@angular/build/package.json'))
host.addBuilder(
  '@angular/build:application',
  require(path.join(buildRoot, 'src/builders/application')).default,
  'Production application',
  JSON.parse(fs.readFileSync(path.join(buildRoot, 'src/builders/application/schema.json')))
)
const registry = new schema.CoreSchemaRegistry()
registry.addPostTransform(schema.transforms.addUndefinedDefaults)
const logger = new logging.Logger('candidate-cloud')
logger.subscribe((entry) => console.log(entry.message))
const run = await new Architect(host, registry).scheduleTarget(target, {}, { logger })
try {
  const result = await run.result
  if (!result.success) process.exitCode = 1
} finally {
  await run.stop()
}
