---
'@xpert-ai/xpert-ui': patch
---

Consolidate daily navigation into Bosi and move assistant views, conversations, project/workspace navigation, and module sections into the shared sidebar panel. Preserve the Data & Ontology entry and the settings page layout. Keep pinned panels stable on hover and switch only on explicit selection, retain per-panel search and scroll, and clear scoped content when the user or organization changes. Preserve existing actions and permission checks, with accessible mobile, keyboard, and pointer navigation.

Align menu typography, row spacing and icon sizes across primary entries and panel content. Keep an open panel aligned with the sidebar when it expands, collapses or resizes.

Prevent the retained, hidden panel overlay from blocking sidebar clicks after repeated navigation and sidebar expansion.

Retain the existing workspace, project and plugin tabs alongside panel navigation, synchronized through the current route. Show assistant profile cards from the panel header avatar instead of a separate menu item, and remove the sidebar footer divider.

Unify navigation color hierarchy: secondary text and monochrome icons become primary on hover, keyboard focus or selection; titles and primary actions remain prominent, while section labels and metadata stay muted. Respect theme colors and reduced-motion preferences.

Center collapsed rail icons, the logo and account avatar across the full sidebar width. Hide the compact rail's scrollbar without disabling scrolling so long assistant lists cannot shift the icons. Round assistant panel avatars and unify menu icon columns, row spacing and secondary action spacing.

Show organization group conversations inline in the assistant directory, with collapse, shared search, creation and personal pin/archive controls. Add rounded avatars and name fallbacks to directory rows; discard group results and pending navigation when the account or organization changes.

Align conversation row icons and labels with the shared panel's action rows using the same icon column and spacing.

Make Assistant profile cards compact with content-driven height, a smaller header and avatar, tighter detail spacing, and larger corners. Show the full description once while retaining profile tabs and extension views.

Match collapsed project and workspace button widths to the icon rail. Navigate primary-menu clicks to their default authorized page while keeping hover as a preview. Open Assistant Remote Views in the ChatKit Workbench maximized, with layout state retained through URL history and manual restore.
