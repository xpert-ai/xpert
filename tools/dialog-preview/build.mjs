// Renders production templates with local fixture data; no application APIs are called.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'
import { build } from 'esbuild'
import { compileString } from 'sass'
import { compile } from '@tailwindcss/node'
import { Scanner } from '@tailwindcss/oxide'
import { batchTwo } from './batch-02.mjs'
import { batchThree } from './batch-03.mjs'
import { batchFour } from './batch-04.mjs'
import { batchFive } from './batch-05.mjs'
import { batchSix } from './batch-06.mjs'
import { batchSeven } from './batch-07.mjs'
import { batchEight } from './batch-08.mjs'
import { batchNine } from './batch-09.mjs'
import { batchTen } from './batch-10.mjs'
import { batchEleven } from './batch-11.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const out = path.join(root, '.cache/dialog-preview')
await fs.mkdir(out, { recursive: true })
const read = (file) => fs.readFile(path.join(root, file), 'utf8')
async function inline(file) {
  const source = await read(file)
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  let template
  function visit(node) {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(sf) === 'template' &&
      ts.isNoSubstitutionTemplateLiteral(node.initializer)
    ) {
      template = node.initializer.text
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  if (!template) throw new Error(`Missing template: ${file}`)
  return template
}
const marketplace = await read('apps/cloud/src/app/features/setting/plugins/marketplace/marketplace.component.html')
const registry = marketplace
  .slice(marketplace.indexOf('<ng-template #registryDialog'))
  .replace(/^<ng-template[^>]*>/, '')
  .replace(/<\/ng-template>\s*$/, '')
const scenes = {
  setup: await inline('apps/cloud/src/app/features/chat/clawxpert/clawxpert-setup-wizard.component.ts'),
  registry,
  members: await inline('apps/cloud/src/app/features/project/project-members-dialog.component.ts'),
  upload: await inline('apps/cloud/src/app/features/xpert/workspace/skills/skill-upload-dialog.component.ts'),
  confirm: await read('packages/ui/src/lib/ui/compat/common/confirm/cdk-confirm-delete/confirm-delete.component.html')
}
for (const [key, scene] of Object.entries({ ...batchTwo, ...batchThree })) {
  scenes[key] = await inline(`apps/cloud/src/app/features/${scene.file}-dialog.component.ts`)
}
for (const [key, scene] of Object.entries({
  ...batchFour,
  ...batchFive,
  ...batchSix,
  ...batchSeven,
  ...batchEight,
  ...batchNine,
  ...batchTen,
  ...batchEleven
})) {
  const file = scene.source ?? `apps/cloud/src/app/${scene.path}`
  scenes[key] = file.endsWith('.ts') ? await inline(file) : await read(file)
  const fullTemplate = scenes[key]
  if (scene.fragment) {
    const start = scenes[key].search(new RegExp(`<ng-template\\s+#${scene.fragment}\\b[^>]*>`))
    if (start < 0) throw new Error(`Missing fragment ${scene.fragment}`)
    scenes[key] = scenes[key]
      .slice(start)
      .replace(/^<ng-template[^>]*>/, '')
      .split(/<\/ng-template\s*>/)[0]
  }
  for (const fragment of scene.appendFragments ?? []) {
    const start = fullTemplate.search(new RegExp(`<ng-template\\s+#${fragment}\\b[^>]*>`))
    if (start < 0) throw new Error(`Missing fragment ${fragment}`)
    scenes[key] += fullTemplate.slice(start).split(/<\/ng-template\s*>/)[0] + '</ng-template>'
  }
}
scenes.workspaceGeneral = await read(
  'apps/cloud/src/app/features/xpert/workspace/settings/general/general.component.html'
)
scenes.workspaceMembers = await read(
  'apps/cloud/src/app/features/xpert/workspace/settings/members/members.component.html'
)
scenes.projectMembers = await read('apps/cloud/src/app/features/chat/project/members/members.component.html')
scenes.workspaceApiKeys = await read('apps/cloud/src/app/features/xpert/xpert/develop/api-key/api-key.component.html')
scenes.openapiConfigure = await read(
  'apps/cloud/src/app/features/xpert/tools/openapi/configure/configure.component.html'
)
scenes.odataConfigure = await read('apps/cloud/src/app/features/xpert/tools/odata/configure/configure.component.html')
scenes.integrationForm = await read(
  'apps/cloud/src/app/@shared/integration/integration-form/integration.component.html'
)
scenes.mcpTestBody = await read('apps/cloud/src/app/@shared/mcp/tool-test/test/tool.component.html')
scenes.toolTestBody = await read('apps/cloud/src/app/features/xpert/tools/tool-test/test/tool.component.html')
scenes.toolAuthInput = await read('apps/cloud/src/app/features/xpert/tools/authorization/input/input.component.html')
scenes.spin = await read('packages/ui/src/lib/ui/compat/common/spin/spin.component.html')
scenes.credentialForm = await read('apps/cloud/src/app/@shared/copilot/credential-form/form.component.html')
scenes.organizationForm = await read(
  'apps/cloud/src/app/features/setting/organizations/organization-step-form/organization-step-form.component.html'
)
scenes.reviewList = await inline('apps/cloud/src/app/features/xpert-access-requests/review-requests-list.component.ts')
scenes.builtinAuthorize = await read(
  'apps/cloud/src/app/features/xpert/tools/builtin/authorize/authorize.component.html'
)
scenes.projectInstallXpert = await read('apps/cloud/src/app/@shared/chat/install-project/xpert/xpert.component.html')
scenes.projectInstallToolset = await read(
  'apps/cloud/src/app/@shared/chat/install-project/toolset/toolset.component.html'
)
scenes.sandboxFileList = await read('apps/cloud/src/app/@shared/chat/file-list/file-list.component.html')
scenes.pipelineSource = await read(
  'apps/cloud/src/app/features/xpert/knowledge/knowledgebase/documents/pipeline/step-1/step.component.html'
)
scenes.pipelineProcess = await read(
  'apps/cloud/src/app/features/xpert/knowledge/knowledgebase/documents/pipeline/step-2/step.component.html'
)
scenes.pipelineSettings = await read(
  'apps/cloud/src/app/features/xpert/knowledge/knowledgebase/documents/pipeline/settings/settings.component.html'
)
scenes.scheduleForm = await read('apps/cloud/src/app/@shared/schedule/form/form.component.html')
scenes.mcpServer = await read('apps/cloud/src/app/@shared/mcp/server/server.component.html')
scenes.assistantPersonalization = await inline(
  'apps/cloud/src/app/features/setting/assistant/assistant-personalization.component.ts'
)
scenes.assistantTriggers = await inline('apps/cloud/src/app/features/setting/assistant/assistant-triggers.component.ts')
scenes.githubInstallBody = await inline('apps/cloud/src/app/@shared/skills/github-install/github-install.component.ts')
scenes.skillRepositoryBody = await read(
  'apps/cloud/src/app/@shared/skills/skill-repositories/skill-repositories.component.html'
)
scenes.skillIndexesBody = await read('apps/cloud/src/app/@shared/skills/indexes/indexes.component.html')
await fs.writeFile(path.join(out, 'scenes.json'), JSON.stringify(scenes))
const zh = JSON.parse(await read('apps/cloud/src/assets/i18n/zh-Hans.json'))
const en = JSON.parse(await read('apps/cloud/src/assets/i18n/en-US.json'))
await fs.writeFile(path.join(out, 'locales.json'), JSON.stringify({ zh, en }))
execFileSync('corepack', ['pnpm', 'exec', 'ngc', '-p', 'tools/dialog-preview/tsconfig.json'], {
  cwd: root,
  stdio: 'inherit'
})
await build({
  entryPoints: [path.join(root, 'tools/dialog-preview/preview.mjs')],
  outfile: path.join(out, 'app.js'),
  bundle: true,
  alias: { '@xpert-ai/headless-ui': path.join(out, 'ngc/tools/dialog-preview/upload-deps.js') },
  format: 'esm',
  platform: 'browser',
  minify: true,
  define: { ngDevMode: 'false' }
})
// Compile the actual shared surface and theme sources, with Cloud's 14px root font.
const scss = `@use 'sass:meta';
@include meta.load-css('packages/ui/src/lib/ui/compat/core/style/cdk-dialog.scss');
@include meta.load-css('apps/cloud/src/styles/utilities.scss');
@include meta.load-css('apps/cloud/src/styles/components/radio.scss');`
const shared = compileString(scss, {
  loadPaths: [root, path.join(root, 'node_modules')],
  logger: { warn() {}, debug() {} }
}).css.replace(/@reference\s+[^;]+;/g, '')
// ngc alone does not process a leaf component's SCSS; compile the production upload styles for this preview.
const uploadStyles = compileString(await read('apps/cloud/src/app/@shared/files/upload/upload.component.scss'), {
  loadPaths: [root, path.join(root, 'node_modules')],
  logger: { warn() {}, debug() {} }
})
  .css.replace(/@reference\s+[^;]+;/g, '')
  .replace(/:host/g, 'xp-upload')
const knowledgeStyles = compileString(
  await read('apps/cloud/src/app/features/xpert/knowledge/new/new.component.scss'),
  {
    loadPaths: [root, path.join(root, 'node_modules')],
    logger: { warn() {}, debug() {} }
  }
).css.replace(/@reference\s+[^;]+;/g, '')
const mcpStyles = compileString(await read('apps/cloud/src/app/@shared/mcp/server/server.component.scss'), {
  loadPaths: [root, path.join(root, 'node_modules')],
  logger: { warn() {}, debug() {} }
})
  .css.replace(/@reference\s+[^;]+;/g, '')
  .replace(/:host/g, 'mcp-server-form')
const css = `@config '../../apps/cloud/tailwind.config.js';
@import '../../packages/ui/src/styles.css';
@import '../../apps/cloud/src/styles/theme/theme.tokens.css';
@import '../../apps/cloud/src/styles/theme/theme.primary.css';
@import '../../apps/cloud/src/styles/theme/theme.tailwind.css';
@import '@angular/cdk/overlay-prebuilt.css';
@source '../../packages/ui/src';
@source '../../libs/formly';
@import '@ctrl/ngx-emoji-mart/picker';
@source '../../apps/cloud/src/app';
@source '../../tools/dialog-preview';
${shared}
${uploadStyles}
${knowledgeStyles}
${mcpStyles}
html, body { margin: 0; min-height: 100%; font-size: 14px; font-family: var(--font-xp-sans); background: var(--background); color: var(--foreground); }
.preview-shell { max-width: 1050px; margin: 0 auto; padding: 56px 28px; }
.preview-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 14px; }
.preview-card { text-align: left; border: 1px solid var(--border); border-radius: 12px; padding: 22px; background: var(--card); cursor: pointer; }
.preview-card:hover { background: var(--muted); }
.preview-top { display: flex; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 36px; }
.preview-muted { color: var(--muted-foreground); }
.preview-note { font-size: 13px; line-height: 1.8; margin: 22px 0; color: var(--muted-foreground); }
.preview-controls { display: flex; gap: 10px; flex-wrap: wrap; }
.preview-controls button { border: 1px solid var(--border); border-radius: 7px; padding: 8px 14px; cursor: pointer; }
@media(max-width:600px) { .preview-top { align-items: flex-start; flex-direction: column; } }
`
await fs.writeFile(path.join(out, 'input.css'), css)
const compiler = await compile(css, { base: path.join(root, 'tools/dialog-preview'), onDependency() {} })
const scanner = new Scanner({ sources: compiler.sources })
await fs.writeFile(path.join(out, 'app.css'), compiler.build(scanner.scan()))
await fs.copyFile(path.join(root, 'tools/dialog-preview/index.html'), path.join(out, 'index.html'))
await fs.cp(path.join(root, 'node_modules/remixicon/fonts'), path.join(out, 'fonts'), { recursive: true })
console.log(`Dialog preview built: ${out}`)

await fs.mkdir(path.join(out, 'assets'), { recursive: true })
await fs.copyFile(path.join(root, 'apps/cloud/src/assets/icon.png'), path.join(out, 'assets/icon.png'))

await fs.cp(path.join(root, 'apps/cloud/src/assets/images/xperts'), path.join(out, 'assets/images/xperts'), {
  recursive: true
})

await fs.cp(path.join(root, 'apps/cloud/src/assets/images/db-logos'), path.join(out, 'assets/images/db-logos'), {
  recursive: true
})
