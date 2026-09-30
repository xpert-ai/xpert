import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRemoteReactComponent, verifyRemoteReactComponent } from '../../../../scripts/build-remote-react.mjs'
await (process.argv.includes('--check') ? verifyRemoteReactComponent : buildRemoteReactComponent)(
    dirname(fileURLToPath(import.meta.url))
)
