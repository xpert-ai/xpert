/**
 * Shared auth token payload returned by host-controlled login flows.
 */
export interface IssuedAuthTokens {
  jwt: string
  refreshToken: string
  userId: string
}
