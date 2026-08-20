import { SetMetadata } from '@nestjs/common'
import { SecretTokenBindingType } from '@xpert-ai/contracts'

export const ALLOWED_CLIENT_SECRET_BINDINGS_METADATA = 'allowedClientSecretBindings'

/**
 * Explicitly opens a controller or route to selected short-lived client-secret grants.
 * ENTERPRISE_XPERT grants are denied by default outside these annotated ChatKit surfaces.
 */
export const AllowClientSecretBindings = (...bindings: SecretTokenBindingType[]) =>
	SetMetadata(ALLOWED_CLIENT_SECRET_BINDINGS_METADATA, bindings)
