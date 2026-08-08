import { seedModule } from '@xpert-ai/server-core'
import { pluginConfig } from './plugin-config'

seedModule(pluginConfig).catch((error: any) => {
  console.log(error)
  process.exit(1)
})
