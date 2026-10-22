# Current request permissions

`GET /api/user/me/permissions` returns `IRolePermission['permission'][]` from
`@xpert-ai/contracts`: the enabled platform permission names for the authenticated
request. It requires JWT authentication, but no role-administration
permission. Authentication must supply loaded grants; an unavailable relation is
a 503 error, while a loaded empty relation returns `[]`.

The route declares `@AuthStrategies('jwt')` for the global authentication
guard. It is not marked `@Public()` and needs no additional Passport guard.
Method strategy declarations replace class declarations; explicit strategies take
precedence over `@Public()`. Routes without a declaration retain the default
JWT/Basic authentication and existing public-route behavior.

The response is marked `Cache-Control: no-store`. It uses the live authenticated
role grants after token restrictions, filters by the authenticated tenant and
role, and never reloads grants from the display-oriented `/user/me` endpoint.
Explicit denies take precedence over duplicate grants. Role names confer no
implicit permissions. JWT permission claims can narrow database grants
but cannot create or restore them.

Use the existing `tenant-id`, `organization-id` and `x-scope-level` headers. A
supplied tenant must match the authenticated tenant. Organization scope requires
current organization access, resolved through `ResolveUserOrganizationAccessCommand`.
The request accepts no target user or role; query parameters cannot change its
identity. API keys and delegated client secrets are not supported by this endpoint.

These are platform role permissions, not organization feature permissions or
resource ACLs. Callers must still enforce workspace access, business-area member
roles and publication authorization. Do not cache the response across requests,
fall back to role templates on errors, or interpret a 403/503 as an empty list.

Deploy this endpoint before switching DataXpert to it. Older Xpert deployments
return 404 and DataXpert intentionally fails closed rather than querying the
administrative role-permission endpoint.

The open-source server does not register the Pro OIDC strategy. This port does not
add OIDC or expand the default authentication methods. API-key strategies remain
limited to routes that explicitly opt into them.
