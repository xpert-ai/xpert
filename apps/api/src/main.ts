import './polyfills'
import { seedDefault, seedModule } from '@xpert-ai/server-core'
import yargs from 'yargs'
import { pluginConfig } from './plugin-config'
import { runTenantAdminCli } from './tenant-admin-cli'
import { bootstrap } from './bootstrap'
import { prepare } from './prepare'
import { runKnowledgeFilterV2MigrationCli } from './knowledge-filter-v2-migration-cli'

// if (process.env.NODE_ENV !== 'production') {
//   installPlugins()
// }

const argv: any = yargs(process.argv).argv
const command = argv.command
prepare()

if (command === 'seedModule') {
  seedModule(pluginConfig)
    .then(() => process.exit(0))
    .catch((error: any) => {
      console.log(error)
      process.exit(1)
    })
} else if (command === 'seed') {
  seedDefault(pluginConfig).catch((error: any) => {
    console.log(error)
    process.exit(1)
  })
} else if (command === 'tenant') {
  runTenantAdminCli(argv, pluginConfig)
    .then(() => process.exit(0))
    .catch((error: any) => {
      console.log(error)
      process.exit(1)
    })
} else if (command === 'knowledge-filter-v2') {
  runKnowledgeFilterV2MigrationCli(argv)
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((error: any) => {
      console.error(error)
      process.exit(1)
    })
} else {
  bootstrap({ title: 'Xpert AI', version: '1.0' })
}
