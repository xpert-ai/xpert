import {
    MCP_AUTH_METHODS,
    MCP_CAPABILITY_APPROVAL_MODES,
    MCP_CAPABILITY_TYPES,
    MCP_PUBLICATION_STATUSES,
    type McpAuthMethod,
    type McpCapabilityApprovalMode,
    type McpCapabilityPolicy,
    type McpCapabilityType,
    type McpOAuthSubjectMapping,
    type McpPublicationStatus
} from '@xpert-ai/contracts'
import { Type } from 'class-transformer'
import {
    ArrayMaxSize,
    ArrayUnique,
    IsArray,
    IsBoolean,
    IsDateString,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateNested
} from 'class-validator'

const PUBLICATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PUBLIC_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/
const CLAIM_NAME_PATTERN = /^[A-Za-z0-9_.:-]+$/

export class CreateMcpPublicationInput {
    @IsString()
    @MinLength(1)
    @MaxLength(191)
    name: string

    @IsString()
    @MaxLength(191)
    @Matches(PUBLICATION_SLUG_PATTERN)
    slug: string

    @IsOptional()
    @IsArray()
    @ArrayUnique()
    @ArrayMaxSize(MCP_AUTH_METHODS.length)
    @IsIn(MCP_AUTH_METHODS, { each: true })
    authMethods?: McpAuthMethod[]

    @IsOptional()
    @IsString()
    @MaxLength(8_000)
    instructions?: string | null
}

export class UpdateMcpPublicationInput {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(191)
    name?: string

    @IsOptional()
    @IsString()
    @MaxLength(191)
    @Matches(PUBLICATION_SLUG_PATTERN)
    slug?: string

    @IsOptional()
    @IsArray()
    @ArrayUnique()
    @ArrayMaxSize(MCP_AUTH_METHODS.length)
    @IsIn(MCP_AUTH_METHODS, { each: true })
    authMethods?: McpAuthMethod[]

    @IsOptional()
    @IsString()
    @MaxLength(8_000)
    instructions?: string | null

    @IsOptional()
    @IsIn(MCP_PUBLICATION_STATUSES)
    status?: McpPublicationStatus
}

export class McpCapabilityRateLimitInput {
    @IsInt()
    @Min(1)
    @Max(100_000)
    requests: number

    @IsInt()
    @Min(1)
    @Max(86_400)
    windowSeconds: number
}

export class McpCapabilityPolicyInput implements McpCapabilityPolicy {
    @IsOptional()
    @IsIn(MCP_CAPABILITY_APPROVAL_MODES)
    approvalMode?: McpCapabilityApprovalMode

    @IsOptional()
    @IsInt()
    @Min(100)
    @Max(24 * 60 * 60 * 1_000)
    timeoutMs?: number

    @IsOptional()
    @ValidateNested()
    @Type(() => McpCapabilityRateLimitInput)
    rateLimit?: McpCapabilityRateLimitInput
}

export class McpCapabilityBindingInput {
    @IsUUID()
    toolsetId: string

    @IsIn(MCP_CAPABILITY_TYPES)
    capabilityType: McpCapabilityType

    @IsString()
    @MinLength(1)
    @MaxLength(191)
    capabilityKey: string

    @IsString()
    @MaxLength(191)
    @Matches(PUBLIC_NAME_PATTERN)
    publicName: string

    @IsOptional()
    @IsBoolean()
    enabled?: boolean

    @IsOptional()
    @ValidateNested()
    @Type(() => McpCapabilityPolicyInput)
    policy?: McpCapabilityPolicyInput | null
}

export class PatchMcpCapabilityBindingInput {
    @IsOptional()
    @IsString()
    @MaxLength(191)
    @Matches(PUBLIC_NAME_PATTERN)
    publicName?: string

    @IsOptional()
    @IsBoolean()
    enabled?: boolean

    @IsOptional()
    @ValidateNested()
    @Type(() => McpCapabilityPolicyInput)
    policy?: McpCapabilityPolicyInput | null
}

export class CreateMcpApiKeyInput {
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    name: string

    @IsOptional()
    @IsIn(['user', 'service_account'])
    subjectType?: 'user' | 'service_account'

    @IsOptional()
    @IsUUID()
    subjectId?: string

    @IsOptional()
    @IsArray()
    @ArrayUnique()
    @ArrayMaxSize(100)
    @IsString({ each: true })
    @MinLength(1, { each: true })
    @MaxLength(191, { each: true })
    scopes?: string[]

    @IsOptional()
    @IsDateString()
    expiresAt?: string | Date | null
}

export class McpOAuthSubjectMappingInput implements McpOAuthSubjectMapping {
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    @Matches(CLAIM_NAME_PATTERN)
    subjectClaim: string

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    @Matches(CLAIM_NAME_PATTERN)
    emailClaim?: string

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    @Matches(CLAIM_NAME_PATTERN)
    clientIdClaim?: string
}

export class McpOAuthIntrospectionInput {
    @IsBoolean()
    enabled: boolean

    @IsOptional()
    @IsString()
    @MaxLength(2_048)
    endpoint?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(500)
    clientId?: string | null

    /** Omit to retain the current secret, send null to clear it, or send a new value to rotate it. */
    @IsOptional()
    @IsString()
    @MaxLength(4_096)
    clientSecret?: string | null
}

export class UpsertMcpOAuthPolicyInput {
    @IsString()
    @MinLength(1)
    @MaxLength(2_048)
    issuer: string

    @IsString()
    @MinLength(1)
    @MaxLength(500)
    audience: string

    @IsOptional()
    @IsArray()
    @ArrayUnique()
    @ArrayMaxSize(100)
    @IsString({ each: true })
    @MinLength(1, { each: true })
    @MaxLength(191, { each: true })
    requiredScopes?: string[]

    @IsOptional()
    @ValidateNested()
    @Type(() => McpOAuthSubjectMappingInput)
    subjectMapping?: McpOAuthSubjectMappingInput

    @IsOptional()
    @ValidateNested()
    @Type(() => McpOAuthIntrospectionInput)
    introspection?: McpOAuthIntrospectionInput

    @IsOptional()
    @IsBoolean()
    enabled?: boolean
}
