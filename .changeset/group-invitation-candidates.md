---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/desktop': patch
---

Include published Agents from organization-shared workspaces in group invitation candidates while preserving tenant, organization, group-owner, and authoring permission boundaries. Show only the latest Agent versions and exclude active group members, including other versions of an Agent already in the group, before pagination.

Apply stable database pagination and let Desktop load all candidate pages. The API keeps its array response and accepts optional limit and offset parameters; the ChatKit load-more interface requires the matching SDK and ChatKit releases.
