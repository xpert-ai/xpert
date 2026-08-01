import { AIPermissionsEnum, RolesEnum } from '@xpert-ai/contracts'

const FULL_AI_PERMISSIONS = [
    AIPermissionsEnum.KNOWLEDGEBASE_EDIT,
    AIPermissionsEnum.COPILOT_VIEW,
    AIPermissionsEnum.COPILOT_EDIT,
    AIPermissionsEnum.XPERT_EDIT,
    AIPermissionsEnum.CHAT_VIEW
]

const MEMBER_PURCHASE_PERMISSIONS = [AIPermissionsEnum.MEMBERSHIP_PURCHASE]
const MEMBERSHIP_ADMIN_PERMISSIONS = [AIPermissionsEnum.MEMBERSHIP_EDIT]
const MODEL_ACCESS_ADMIN_PERMISSIONS = [
    AIPermissionsEnum.MODEL_ACCESS_REQUEST_VIEW,
    AIPermissionsEnum.MODEL_ACCESS_REQUEST_EDIT
]
const MODEL_GATEWAY_USER_PERMISSIONS = [AIPermissionsEnum.MODEL_GATEWAY_USE]
const MODEL_GATEWAY_ADMIN_PERMISSIONS = [AIPermissionsEnum.MODEL_GATEWAY_MANAGE]
const BILLING_ADMIN_PERMISSIONS = [
    AIPermissionsEnum.BILLING_PRODUCT_EDIT,
    AIPermissionsEnum.BILLING_REFUND,
    AIPermissionsEnum.PAYMENT_PROVIDER_EDIT
]

const VIEWER_AI_PERMISSIONS = [
    AIPermissionsEnum.COPILOT_VIEW,
    AIPermissionsEnum.CHAT_VIEW,
    ...MEMBER_PURCHASE_PERMISSIONS
]

export const DEFAULT_ROLE_PERMISSIONS = [
    {
        role: RolesEnum.SUPER_ADMIN,
        defaultEnabledPermissions: [
            ...FULL_AI_PERMISSIONS,
            ...MEMBERSHIP_ADMIN_PERMISSIONS,
            ...MODEL_ACCESS_ADMIN_PERMISSIONS,
            ...MODEL_GATEWAY_USER_PERMISSIONS,
            ...MODEL_GATEWAY_ADMIN_PERMISSIONS,
            ...MEMBER_PURCHASE_PERMISSIONS,
            ...BILLING_ADMIN_PERMISSIONS
        ]
    },
    {
        role: RolesEnum.ADMIN,
        defaultEnabledPermissions: [
            ...FULL_AI_PERMISSIONS,
            ...MEMBERSHIP_ADMIN_PERMISSIONS,
            ...MODEL_ACCESS_ADMIN_PERMISSIONS,
            ...MODEL_GATEWAY_USER_PERMISSIONS,
            ...MODEL_GATEWAY_ADMIN_PERMISSIONS,
            ...MEMBER_PURCHASE_PERMISSIONS,
            ...BILLING_ADMIN_PERMISSIONS
        ]
    },
    {
        role: RolesEnum.TRIAL,
        defaultEnabledPermissions: [...FULL_AI_PERMISSIONS, ...MEMBER_PURCHASE_PERMISSIONS]
    },
    {
        role: RolesEnum.AI_BUILDER,
        defaultEnabledPermissions: [...FULL_AI_PERMISSIONS, ...MEMBER_PURCHASE_PERMISSIONS]
    },
    {
        role: RolesEnum.VIEWER,
        defaultEnabledPermissions: [...VIEWER_AI_PERMISSIONS]
    }
]
