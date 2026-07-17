#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import {
  DEFAULT_API_URL,
  DEFAULT_KEYCHAIN_SERVICE,
  DEFAULT_PASSWORD_KEYCHAIN_SERVICE,
  DEFAULT_USERNAME_KEYCHAIN_SERVICE,
  LocalPluginCliError,
  assertResponseOk,
  createRequestHeaders,
  handleCliError,
  isVerifiedPluginList,
  parseCliArgs,
  parsePluginConfig,
  postJson,
  readResponseMessage,
  requireAuthentication,
  resolvePluginEndpoint,
  resolvePluginInput
} from './local-plugin-cli.mjs'

const BOOLEAN_FLAGS = ['dryRun', 'forceInstall', 'help', 'noKeychain', 'skipBuild', 'skipTest']

function printUsage() {
  console.log(`Build, test, install or refresh, and verify a local Xpert plugin.

Usage:
  corepack pnpm plugin:deploy:local --plugin-dir /abs/path/to/plugin [options]
  corepack pnpm plugin:deploy:local <plugin-name> <workspace-path> [options]

Plugin options:
  --plugin-dir <path>        Plugin workspace. --workspace-path is also accepted
  --plugin-name <name>       Package name. Defaults to package.json name
  --force-install            Skip refresh and install from source=code directly
  --config <json>            Optional config; supplying config forces installation
  --config-file <path>       Optional config file; supplying config forces installation

Validation options:
  --build-command <cmd>      Override the detected build command
  --build-cwd <path>         Working directory for --build-command
  --test-command <cmd>       Override the detected test command
  --test-cwd <path>          Working directory for --test-command
  --skip-build               Skip the build step
  --skip-test                Skip the test step

API and scope options:
  --api-url <url>            API origin, default: ${DEFAULT_API_URL}
  --endpoint <url>           Full plugin install endpoint
  --org-id <id>              Organization scope identifier
  --tenant-id <id>           Tenant scope identifier
  --scope <scope>            organization or tenant
  --version <version>        Optional version for installation

Authentication options:
  --token <jwt>              Bearer token; environment or Keychain is safer
  --username <identifier>    Xpert email or username; Keychain is preferred
  --password <password>      Xpert password; prefer Keychain or process environment
  --login-endpoint <url>     Login endpoint, default: <api-url>/api/auth/login
  --keychain-service <name>  Default: ${DEFAULT_KEYCHAIN_SERVICE}
  --keychain-account <name>  Default: current OS user
  --username-keychain-service <name>  Default: ${DEFAULT_USERNAME_KEYCHAIN_SERVICE}
  --password-keychain-service <name>  Default: ${DEFAULT_PASSWORD_KEYCHAIN_SERVICE}
  --no-keychain              Do not read macOS Keychain

Other options:
  --dry-run                  Print the plan without executing it
  --help                     Show this help

Environment fallbacks:
  XPERT_API_URL, XPERT_TOKEN, XPERT_USERNAME, XPERT_PASSWORD
  XPERT_ORG_ID, XPERT_TENANT_ID, XPERT_SCOPE
  XPERT_PLUGIN_BUILD_COMMAND, XPERT_PLUGIN_BUILD_CWD
  XPERT_PLUGIN_TEST_COMMAND, XPERT_PLUGIN_TEST_CWD
  XPERT_KEYCHAIN_SERVICE, XPERT_KEYCHAIN_ACCOUNT
  XPERT_USERNAME_KEYCHAIN_SERVICE, XPERT_PASSWORD_KEYCHAIN_SERVICE

Store login credentials in macOS Keychain so every deployment obtains a fresh JWT:
  security add-generic-password -a "$USER" -s ${DEFAULT_USERNAME_KEYCHAIN_SERVICE} -U -w "<xpert-username>"
  security add-generic-password -a "<xpert-username>" -s ${DEFAULT_PASSWORD_KEYCHAIN_SERVICE} -U -w
`)
}

function findClosestAncestorWith(filename, startDir) {
  let currentDir = startDir
  while (true) {
    if (fs.existsSync(path.join(currentDir, filename))) {
      return currentDir
    }
    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      return null
    }
    currentDir = parentDir
  }
}

function createCommandPlan({ customCommand, customCwd, packageJson, scriptName, workspacePath, pluginName }) {
  if (customCommand) {
    return {
      command: customCommand,
      cwd: path.resolve(customCwd || workspacePath),
      display: customCommand,
      shell: true
    }
  }

  if (packageJson?.scripts?.[scriptName]) {
    return {
      command: 'corepack',
      args: ['pnpm', 'run', scriptName],
      cwd: workspacePath,
      display: `corepack pnpm run ${scriptName}`,
      shell: false
    }
  }

  if (scriptName === 'build') {
    const nxRoot = findClosestAncestorWith('nx.json', workspacePath)
    if (nxRoot) {
      return {
        command: 'corepack',
        args: ['pnpm', 'nx', 'build', pluginName],
        cwd: nxRoot,
        display: `corepack pnpm nx build ${pluginName}`,
        shell: false
      }
    }
  }

  return null
}

function runCommandPlan(label, plan, dryRun) {
  if (!plan) {
    console.log(`[plugin:deploy:local] No ${label} command detected; skipping.`)
    return
  }

  console.log(`[plugin:deploy:local] ${label} cwd:`, plan.cwd)
  console.log(`[plugin:deploy:local] ${label} command:`, plan.display)
  if (dryRun) {
    return
  }

  const result = spawnSync(plan.command, plan.args ?? [], {
    cwd: plan.cwd,
    stdio: 'inherit',
    shell: plan.shell
  })
  if (result.status !== 0) {
    throw new LocalPluginCliError(`${label} failed with exit code ${result.status ?? 'unknown'}.`)
  }
}

function canFallBackToInstall(response) {
  if (response.status === 404) {
    return true
  }
  if (response.status !== 400) {
    return false
  }
  const message = readResponseMessage(response.body)
  return [
    'is not refreshable in the current scope',
    'is not installed from local source code',
    'does not have a stored sourceConfig.workspacePath'
  ].some((fragment) => message.includes(fragment))
}

async function deployPlugin({ args, config, headers, pluginEndpoint, pluginName, workspacePath }) {
  const shouldInstall = args.forceInstall || config !== undefined
  if (!shouldInstall) {
    console.log(`[plugin:deploy:local] Refreshing ${pluginName} from its stored workspace path...`)
    const refreshResponse = await postJson(`${pluginEndpoint}/refresh`, headers, { pluginName })
    if (refreshResponse.ok) {
      return 'refreshed'
    }
    if (!canFallBackToInstall(refreshResponse)) {
      assertResponseOk('Plugin refresh', refreshResponse)
    }
    console.log('[plugin:deploy:local] No refreshable local registration was found; installing from source=code.')
  } else if (config !== undefined && !args.forceInstall) {
    console.log('[plugin:deploy:local] Plugin config was supplied; installing so the new config is applied.')
  }

  const body = {
    pluginName,
    source: 'code',
    sourceConfig: { workspacePath }
  }
  if (args.version) {
    body.version = args.version
  }
  if (config !== undefined) {
    body.config = config
  }
  const installResponse = await postJson(pluginEndpoint, headers, body)
  assertResponseOk('Plugin install', installResponse)
  return 'installed'
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2), { booleanFlags: BOOLEAN_FLAGS })
  if (args.help) {
    printUsage()
    return
  }
  if (args.mode) {
    throw new LocalPluginCliError('The --mode option has been removed. Local code installs always use copy mode.')
  }

  const { packageJson, pluginName, workspacePath } = resolvePluginInput(args)
  const config = parsePluginConfig(args)
  const authentication = await requireAuthentication(args, { dryRun: args.dryRun })
  if (!authentication) {
    console.log('[plugin:deploy:local] Dry run: no token found; a real deployment would stop and request secure setup.')
  } else {
    console.log(`[plugin:deploy:local] Authentication source: ${authentication.source}`)
  }
  const headers = createRequestHeaders(args, authentication?.token ?? 'dry-run-token', authentication?.tenantId)

  const buildPlan = args.skipBuild
    ? null
    : createCommandPlan({
        customCommand: args.buildCommand || process.env.XPERT_PLUGIN_BUILD_COMMAND,
        customCwd: args.buildCwd || process.env.XPERT_PLUGIN_BUILD_CWD,
        packageJson,
        pluginName,
        scriptName: 'build',
        workspacePath
      })
  const testPlan = args.skipTest
    ? null
    : createCommandPlan({
        customCommand: args.testCommand || process.env.XPERT_PLUGIN_TEST_COMMAND,
        customCwd: args.testCwd || process.env.XPERT_PLUGIN_TEST_CWD,
        packageJson,
        pluginName,
        scriptName: 'test',
        workspacePath
      })

  if (args.skipBuild) {
    console.log('[plugin:deploy:local] Build skipped by request.')
  } else {
    runCommandPlan('build', buildPlan, args.dryRun)
  }
  if (args.skipTest) {
    console.log('[plugin:deploy:local] Test skipped by request.')
  } else {
    runCommandPlan('test', testPlan, args.dryRun)
  }

  const pluginEndpoint = resolvePluginEndpoint(args)
  console.log('[plugin:deploy:local] Plugin:', pluginName)
  console.log('[plugin:deploy:local] Workspace:', workspacePath)
  console.log('[plugin:deploy:local] Endpoint:', pluginEndpoint)
  console.log('[plugin:deploy:local] Config supplied:', config !== undefined)
  if (args.dryRun) {
    console.log('[plugin:deploy:local] Dry run only. No API request was sent.')
    return
  }

  const action = await deployPlugin({ args, config, headers, pluginEndpoint, pluginName, workspacePath })
  const verifyResponse = await postJson(`${pluginEndpoint}/by-names`, headers, { names: [pluginName] })
  assertResponseOk('Plugin verification', verifyResponse)
  if (!isVerifiedPluginList(verifyResponse.body)) {
    throw new LocalPluginCliError(`Plugin verification returned no descriptor for ${pluginName}.`)
  }

  console.log(`[plugin:deploy:local] ${pluginName} ${action} and verified successfully.`)
}

main().catch((error) => handleCliError('plugin:deploy:local', error))
