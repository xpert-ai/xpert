function createShellMethods(ClientError) {
  async function call(service, method, input) {
    if (!service.shell) throw new ClientError('Desktop Shell requires the native macOS app.', 400)
    try {
      return await service.shell[method](input)
    } catch (error) {
      if (error instanceof ClientError) throw error
      const messages = {
        SHELL_DENIED: 'Local Shell is disabled in permissions. Change the policy before requesting another command.',
        GRANT_REVOKED: 'This command permission expired or was revoked. It was not executed.',
        OPERATION_CONFLICT: 'This command no longer matches the approved request. It was not executed.',
        SESSION_CHANGED: 'The account or organization changed. Request permission again in the current conversation.',
        DEVICE_OFFLINE: 'This computer is offline. Stop this operation; do not retry automatically.'
      }
      throw new ClientError(
        messages[error.message] ||
          'Desktop Shell could not complete the operation. Check the connection and Shell settings.',
        400
      )
    }
  }
  return {
    shellConfigure(input) {
      return call(this, 'configureSettings', input)
    },
    shellPrepare(input) {
      return call(this, 'prepare', input)
    },
    shellDecide(input) {
      return call(this, 'decide', input)
    },
    shellPolicy(input) {
      return call(this, 'setPolicy', input)
    },
    shellState() {
      return (
        this.shell?.snapshot() ?? {
          policy: 'ask',
          available: false,
          enabled: false,
          connected: false,
          deviceId: null,
          settings: null,
          errorCode: null
        }
      )
    },
    shellEnable(input) {
      return call(this, 'enable', input)
    },
    shellDisable() {
      return call(this, 'disable')
    },
    shellBind(input) {
      return call(this, 'bind', input)
    },
    shellUnbind(input) {
      return call(this, 'unbind', input)
    },
    shellOperations() {
      return call(this, 'operations')
    },
    shellCancel(input) {
      return call(this, 'cancel', input)
    }
  }
}
module.exports = { createShellMethods }
