---
'@xpert-ai/xpert-ui': patch
---

Add a shared hover panel beside the collapsed desktop sidebar. Keep the panel mounted and positioned while switching main menus, with delayed dismissal, keyboard access, and existing click navigation preserved. Add a header with the current menu title, an expandable and clearable search field, and a pin toggle that reserves page space while keeping the icon rail. Animate panel entrance and pin transitions, respecting reduced motion. Pinned panels fill the page height and share the page's outer rounded surface without the floating card shadow or gaps. Hovering other main menus preserves the pinned menu and search until the panel is unpinned. Allow pointer and keyboard width resizing only while pinned, remember the preferred width locally for both modes, and constrain it to the viewport. Panel content and search results will be connected separately.
