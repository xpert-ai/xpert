import { SetMetadata } from '@nestjs/common'

export const ALLOW_PERSONAL_API_KEYS_METADATA = 'allowPersonalApiKeys'

/** Opt an AI endpoint into human-owner API key authentication; resource authorization still applies. */
export const AllowPersonalApiKeys = (allowed = true) => SetMetadata(ALLOW_PERSONAL_API_KEYS_METADATA, allowed)
