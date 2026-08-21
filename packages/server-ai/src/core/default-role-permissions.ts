import { AIPermissionsEnum, RolesEnum } from '@xpert-ai/contracts'

const FULL_AI_PERMISSIONS = [
    AIPermissionsEnum.KNOWLEDGEBASE_EDIT,
    AIPermissionsEnum.COPILOT_VIEW,
    AIPermissionsEnum.COPILOT_EDIT,
    AIPermissionsEnum.MODEL_USAGE_MONITOR,
    AIPermissionsEnum.XPERT_EDIT,
    AIPermissionsEnum.CHAT_VIEW,
    AIPermissionsEnum.EVOLUTION_VIEW,
    AIPermissionsEnum.EVOLUTION_MANAGE
]

const MEMBERSHIP_USE_PERMISSIONS = [AIPermissionsEnum.MEMBERSHIP_USE]
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

const PROJECT_VIEW_PERMISSIONS = [AIPermissionsEnum.XPERT_PROJECT_VIEW]
const PROJECT_EDIT_PERMISSIONS = [AIPermissionsEnum.XPERT_PROJECT_CREATE, AIPermissionsEnum.XPERT_PROJECT_EDIT]
const PROJECT_ADMIN_PERMISSIONS = [AIPermissionsEnum.XPERT_PROJECT_MANAGE]

const VIEWER_AI_PERMISSIONS = [
    AIPermissionsEnum.COPILOT_VIEW,
    AIPermissionsEnum.CHAT_VIEW,
    AIPermissionsEnum.EVOLUTION_VIEW,
    ...MEMBERSHIP_USE_PERMISSIONS
]

export const DEFAULT_ROLE_PERMISSIONS = [
    {
        role: RolesEnum.SUPER_ADMIN,
        defaultEnabledPermissions: [
            ...FULL_AI_PERMISSIONS,
            ...PROJECT_VIEW_PERMISSIONS,
            ...PROJECT_EDIT_PERMISSIONS,
            ...PROJECT_ADMIN_PERMISSIONS,
            ...MEMBERSHIP_ADMIN_PERMISSIONS,
            ...MODEL_ACCESS_ADMIN_PERMISSIONS,
            ...MODEL_GATEWAY_USER_PERMISSIONS,
            ...MODEL_GATEWAY_ADMIN_PERMISSIONS,
            ...MEMBERSHIP_USE_PERMISSIONS,
            ...BILLING_ADMIN_PERMISSIONS
        ]
    },
    {
        role: RolesEnum.ADMIN,
        defaultEnabledPermissions: [
            ...FULL_AI_PERMISSIONS,
            ...PROJECT_VIEW_PERMISSIONS,
            ...PROJECT_EDIT_PERMISSIONS,
            ...PROJECT_ADMIN_PERMISSIONS,
            ...MEMBERSHIP_ADMIN_PERMISSIONS,
            ...MODEL_ACCESS_ADMIN_PERMISSIONS,
            ...MODEL_GATEWAY_USER_PERMISSIONS,
            ...MODEL_GATEWAY_ADMIN_PERMISSIONS,
            ...MEMBERSHIP_USE_PERMISSIONS,
            ...BILLING_ADMIN_PERMISSIONS
        ]
    },
    {
        role: RolesEnum.TRIAL,
        defaultEnabledPermissions: [
            AIPermissionsEnum.COPILOT_EDIT,
            AIPermissionsEnum.XPERT_EDIT,
            AIPermissionsEnum.CHAT_VIEW,
            ...PROJECT_VIEW_PERMISSIONS,
            ...PROJECT_EDIT_PERMISSIONS,
            ...MEMBERSHIP_USE_PERMISSIONS
        ]
    },
    {
        role: RolesEnum.AI_BUILDER,
        defaultEnabledPermissions: [
            ...FULL_AI_PERMISSIONS,
            ...PROJECT_VIEW_PERMISSIONS,
            ...PROJECT_EDIT_PERMISSIONS,
            ...MEMBERSHIP_USE_PERMISSIONS
        ]
    },
    {
        role: RolesEnum.VIEWER,
        defaultEnabledPermissions: [...VIEWER_AI_PERMISSIONS, ...PROJECT_VIEW_PERMISSIONS]
    }
]
