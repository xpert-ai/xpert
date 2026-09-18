import { ViewClientCommandRegistry } from '../../@shared/view-extension/view-client-command-registry.service'

type ConnectionCreationOptions = {
  canCreate: () => boolean
  create: () => Promise<{ id?: string } | undefined>
}

export function registerDataSourceCreateCommand(
  registry: ViewClientCommandRegistry,
  options: ConnectionCreationOptions
) {
  return registry.register('platform.data-source.create', async () => {
    if (!options.canCreate()) {
      return { success: false, code: 'forbidden', message: 'Data source edit permission is required.' }
    }
    const source = await options.create()
    // Never return credentials or the data source options to the plugin iframe.
    return source?.id
      ? { success: true, status: 'created', dataSourceId: source.id }
      : { success: true, status: 'cancelled' }
  })
}
