const { translate } = require('./i18n/index.mjs')
const { ClientError } = require('./service.cjs')
const methods = new Set([
  'state',
  'refreshProfile',
  'shellState',
  'shellEnable',
  'shellDisable',
  'shellBind',
  'shellUnbind',
  'shellOperations',
  'shellCancel',
  'configure',
  'login',
  'loginLocal',
  'selectOrganization',
  'listBots',
  'sidebarState',
  'updateSidebar',
  'botActivity',
  'botConversation',
  'botProfile',
  'botConversations',
  'botProfileViews',
  'openProfileView',
  'closeProfileView',
  'profileViewRequest',
  'markBotRead',
  'markAllBotRead',
  'editBot',
  'duplicateBot',
  'chatSession',
  'toolOutputPreview',
  'workbenchSession',
  'listCatalog',
  'pluginConnection',
  'startPluginConnection',
  'checkPluginConnection',
  'cancelPluginConnection',
  'pluginLibrary',
  'addWorkspacePlugin',
  'requestExpertAccess',
  'applicationSetup',
  'initializeApplication',
  'templateWorkspaces',
  'templateSetup',
  'installTemplate',
  'logout'
])
async function dispatch(service, method, argument) {
  try {
    if (!methods.has(method)) throw new ClientError('Unsupported operation.', 403)
    return { ok: true, value: await service[method](argument) }
  } catch (error) {
    return {
      ok: false,
      message: translate(
        service.config.locale,
        error instanceof ClientError ? error.key : 'The operation failed. Please retry.',
        error instanceof ClientError ? error.params : {}
      ),
      key: error instanceof ClientError ? error.key : 'The operation failed. Please retry.',
      params: error instanceof ClientError ? error.params : {},
      status: error.status || 500
    }
  }
}
module.exports = { dispatch }
