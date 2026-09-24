import { execFileSync } from 'node:child_process'
import os from 'node:os'

// Development tests use the existing Xpert credential convention, never browser storage.
export function readLocalCredentials() {
  if (process.env.XPERT_USERNAME && process.env.XPERT_PASSWORD) {
    return { email: process.env.XPERT_USERNAME, password: process.env.XPERT_PASSWORD }
  }
  const read = (account, service) =>
    execFileSync('security', ['find-generic-password', '-a', account, '-s', service, '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  try {
    const email = read(os.userInfo().username, 'xpert-local-plugin-username')
    return { email, password: read(email, 'xpert-local-plugin-password') }
  } catch {
    throw new Error('Configure Xpert development credentials in macOS Keychain first.')
  }
}
