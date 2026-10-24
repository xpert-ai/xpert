import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { test } from 'node:test'

const execute = promisify(execFile)
for (const failure of ['soffice', 'pdftotext', 'fc-match', 'font', 'pagination', 'none']) {
  test(`document dependency probe: ${failure}`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'document-dependency-test-'))
    try {
      const bin = path.join(root, 'bin')
      await mkdir(bin)
      const commands = {
        soffice: `const fs=require('fs'),p=require('path');const i=process.argv.indexOf('--outdir');if(i<0)console.log('LibreOffice 7');else fs.writeFileSync(p.join(process.argv[i+1],'health.pdf'),'%PDF-1.4');`,
        pdftotext: `if(process.argv.includes('-v'))console.error('pdftotext 22');else require('fs').writeFileSync(process.argv.at(-1),${JSON.stringify(failure === 'pagination' ? 'no pages' : 'Preview page one 预览验证\fPreview page two\f')});`,
        'fc-match': `console.log(${failure === 'font' ? "'fallback font'" : 'process.argv.at(-1)'});`
      }
      for (const [name, script] of Object.entries(commands)) {
        if (failure === name) continue
        await writeFile(path.join(bin, name), `#!${process.execPath}\n${script}`)
        await chmod(path.join(bin, name), 0o755)
      }
      const result = await execute(
        process.execPath,
        [new URL('../runtime/verify-document-preview.mjs', import.meta.url).pathname],
        {
          env: { ...process.env, PATH: bin, TMPDIR: root }
        }
      ).catch((error) => error)
      if (failure === 'none') assert.equal(JSON.parse(result.stdout).totalPages, 2)
      else {
        assert.equal(result.code, 1)
        assert.match(result.stderr, failure === 'pagination' ? /EXPORT_OUTPUT_INVALID/ : /SANDBOX_DEPENDENCY_MISSING/)
        if (failure !== 'pagination')
          assert.match(result.stderr, new RegExp(failure === 'font' ? 'Noto Sans CJK SC' : failure))
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}
