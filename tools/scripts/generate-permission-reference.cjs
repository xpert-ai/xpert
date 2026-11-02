#!/usr/bin/env node
// Generate defaults from the actual enum/preset modules without importing server application side effects.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '../..')
function load(file, imports = {}) {
  const exports = {}
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  vm.runInNewContext(
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
      .outputText,
    {
      exports,
      require(name) {
        if (!(name in imports)) throw Error(`Unexpected dependency: ${name}`)
        return imports[name]
      }
    }
  )
  return exports
}
const ai = load('packages/contracts/src/ai/role-permissions.ts')
const core = load('packages/contracts/src/role-permission.model.ts', { './ai/index': ai })
const role = load('packages/contracts/src/role.model.ts')
const catalog = load('packages/contracts/src/role-permission-modules.ts', {
  './ai/role-permissions': ai,
  './role-permission.model': core
}).ROLE_PERMISSION_CATALOG
const contracts = { ...ai, ...core, ...role }
const roles = Object.values(role.RolesEnum),
  grants = new Map(roles.map((name) => [name, new Set()]))
for (const file of [
  'packages/server/src/role-permission/default-role-permissions.ts',
  'packages/server-ai/src/core/default-role-permissions.ts'
]) {
  for (const row of load(file, { '@xpert-ai/contracts': contracts }).DEFAULT_ROLE_PERMISSIONS) {
    for (const permission of row.defaultEnabledPermissions) {
      if (!catalog.some((entry) => entry.permission === permission))
        throw Error(`Unknown default permission: ${permission}`)
      grants.get(row.role).add(permission)
    }
  }
}
if (new Set(catalog.map((row) => row.permission)).size !== catalog.length) throw Error('Duplicate permission codes')
let result =
  '# 默认角色权限表（自动生成）\n\n由权限目录与核心／AI 默认分配生成，不代表数据库当前授权。权限职责参见 [AI 权限注释](../packages/contracts/src/ai/role-permissions.ts)。\n\n运行 `node tools/scripts/generate-permission-reference.cjs` 更新；加 `--check` 检查漂移。\n\n'
result += '| Permission | 模块 | 状态 | ' + roles.join(' | ') + ' |\n'
result += '| --- | --- | --- | ' + roles.map(() => '---').join(' | ') + ' |\n'
for (const entry of catalog) {
  const status = entry.contractOnly ? '待业务接入' : entry.deprecated ? '旧权限' : '已定义'
  result +=
    '| `' +
    entry.permission +
    '` | ' +
    entry.module +
    ' | ' +
    status +
    ' | ' +
    roles.map((name) => (grants.get(name).has(entry.permission) ? '✓' : '—')).join(' | ') +
    ' |\n'
}
const target = path.join(root, 'docs/role-permission-defaults.generated.md')
const prettier = require('prettier')
prettier
  .resolveConfig(target)
  .then((options) => prettier.format(result, { ...options, parser: 'markdown' }))
  .then((formatted) => {
    if (process.argv.includes('--check')) {
      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== formatted) {
        console.error('Permission defaults changed; regenerate docs/role-permission-defaults.generated.md')
        process.exitCode = 1
      } else console.log(`Permission catalog/defaults verified: ${catalog.length} permissions, ${roles.length} roles.`)
    } else {
      fs.writeFileSync(target, formatted)
      console.log('Updated docs/role-permission-defaults.generated.md')
    }
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
