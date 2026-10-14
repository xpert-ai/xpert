import type { IUser } from '@xpert-ai/contracts'

/** Keep candidate, persisted and live member labels consistent, including accounts without names. */
export function groupUserName(
    user: Pick<IUser, 'id' | 'name' | 'firstName' | 'lastName' | 'username' | 'email'>,
    fallback = user.id
): string {
    return (
        user.name?.trim() ||
        [user.firstName?.trim(), user.lastName?.trim()].filter(Boolean).join(' ') ||
        user.username?.trim() ||
        user.email?.trim() ||
        fallback
    )
}
