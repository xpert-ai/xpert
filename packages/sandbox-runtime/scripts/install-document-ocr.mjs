// Runs during explicit Runtime installation/image build, never during document processing.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function installDocumentOcr({ root, familyRoot, lock, download, downloads, python }) {
  const requirements = await readFile(path.join(familyRoot, 'requirements.txt'))
  const modelsBytes = await readFile(path.join(familyRoot, 'models.lock.json'))
  const backend = await readFile(path.join(familyRoot, 'runtime/hybrid-backend.py'))
  for (const [bytes, expected] of [
    [requirements, lock.ocr.requirementsSha256],
    [modelsBytes, lock.ocr.modelsSha256],
    [backend, lock.ocr.backendSha256]
  ])
    if (sha(bytes) !== expected) throw new Error('OCR Runtime artifact lock mismatch.')
  const venv = path.join(root, 'python')
  if (python) {
    execFileSync(python, ['-m', 'venv', venv], { stdio: 'inherit' })
    execFileSync(
      path.join(venv, 'bin/python3'),
      [
        '-m',
        'pip',
        'install',
        '--no-cache-dir',
        '--require-hashes',
        '--extra-index-url',
        'https://download.pytorch.org/whl/cpu',
        '-r',
        path.join(familyRoot, 'requirements.txt')
      ],
      { stdio: 'inherit', timeout: 1200000 }
    )
  } else {
    execFileSync('uv', ['venv', '--native-tls', '--python', lock.ocr.pythonVersion, venv], {
      stdio: 'inherit',
      timeout: 300000
    })
    execFileSync(
      'uv',
      [
        'pip',
        'sync',
        '--native-tls',
        '--torch-backend',
        'cpu',
        '--require-hashes',
        '--python',
        path.join(venv, 'bin/python3'),
        path.join(familyRoot, 'requirements.txt')
      ],
      { stdio: 'inherit', timeout: 1200000 }
    )
  }
  await copyFile(path.join(familyRoot, 'requirements.txt'), path.join(root, 'requirements.txt'))
  await copyFile(path.join(familyRoot, 'models.lock.json'), path.join(root, 'models.lock.json'))
  await writeFile(path.join(root, 'hybrid-backend.py'), backend)
  for (const [index, file] of JSON.parse(modelsBytes).files.entries()) {
    if (!safe(file.path) || (file.archiveMember && !safe(file.archiveMember)))
      throw new Error('Invalid OCR model path.')
    const target = path.join(root, 'models', file.path)
    const input = path.join(downloads, `ocr-${index}`)
    await download(file.url, input, `sha256-${Buffer.from(file.downloadSha256, 'hex').toString('base64')}`)
    const bytes = file.archiveMember
      ? execFileSync('unzip', ['-p', input, file.archiveMember], { maxBuffer: file.size + 1 })
      : await readFile(input)
    if (bytes.length !== file.size || sha(bytes) !== file.sha256) throw new Error('OCR model integrity mismatch.')
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, bytes)
  }
}
function safe(value) {
  return (
    typeof value === 'string' &&
    !/[\\\0]/.test(value) &&
    !path.isAbsolute(value) &&
    value.split('/').every((p) => p && p !== '.' && p !== '..')
  )
}
function sha(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}
