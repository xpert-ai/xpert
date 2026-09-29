// Build architecture-specific feeds only from installers already verified by collectAssets.
// JSON is valid YAML; deterministic metadata makes partial draft uploads resumable.
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const { metadataName } = createRequire(import.meta.url)('../../apps/desktop/electron/updates/config.cjs')

export function createUpdateAssets(directory, plan, receipts) {
  return receipts.flatMap((receipt) => {
    const [platform, arch] = receipt.target.split('-')
    if (platform === 'mac' && !['signed', 'signed-notarized'].includes(receipt.signing)) return []
    const extension = { mac: '.zip', win: '.exe', linux: '.AppImage' }[platform]
    const installer = receipt.artifacts.find((asset) => asset.file.endsWith(extension))
    const data = readFileSync(join(directory, installer.file))
    const sha512 = createHash('sha512').update(data).digest('base64')
    const metadata = {
      version: plan.version,
      files: [{ url: installer.file, sha512, size: data.length }],
      path: installer.file,
      sha512
    }
    const file = metadataName({ mac: 'darwin', win: 'win32', linux: 'linux' }[platform], arch)
    const content = JSON.stringify(metadata, null, 2) + '\n'
    writeFileSync(join(directory, file), content)
    return [{ file, sha256: createHash('sha256').update(content).digest('hex') }]
  })
}
