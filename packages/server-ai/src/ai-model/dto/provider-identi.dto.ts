import { Exclude } from 'class-transformer'
import { AiProviderDto } from './provider.dto'

/**
 * IdentiDto: The minimum attributes that can be exposed to represent this object
 */
@Exclude()
export class AiProviderIdentiDto extends AiProviderDto {}
