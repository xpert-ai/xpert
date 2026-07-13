import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const family = argument('--family')
const image = argument('--image')
const output = path.resolve(argument('--output'))
const digest = image.match(/@(sha256:[a-f0-9]{64})$/i)?.[1]?.toLowerCase()
if (!digest) throw new Error('--image must be an immutable digest reference.')
const definition = JSON.parse(await readFile(path.join(packageRoot, 'images', family, 'image.json'), 'utf8'))
const template = await readFile(path.join(packageRoot, definition.artifactCatalogTemplate), 'utf8')
const rendered = template.replaceAll('__IMMUTABLE_IMAGE__', image).replaceAll('__IMAGE_DIGEST__', digest)
await mkdir(path.dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify(JSON.parse(rendered), null, 2)}\n`)

function argument(name) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : ''
  if (!value) throw new Error(`${name} is required.`)
  return value
}
