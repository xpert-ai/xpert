function createShellMethods(ClientError) {
  async function call(service, method, input) {
    if (!service.shell) throw new ClientError('Desktop Shell requires the native macOS app.', 400)
    try {
      return await service.shell[method](input)
    } catch (error) {
      if (error instanceof ClientError) throw error
      throw new ClientError(
        'Desktop Shell could not complete the operation. Check the connection and Shell settings.',
        400
      )
    }
  }
  return {
    shellState() {
      return (
        this.shell?.snapshot() ?? {
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
