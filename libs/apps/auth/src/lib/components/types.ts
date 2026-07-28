/**
 * @deprecated Use `CloudMenuItem` from `apps/cloud/src/app/features/sidebar` for the cloud shell menu.
 * The auth package menu is kept only for compatibility while auth UI is migrated into cloud.
 */
export interface XpMenuItem {
  title: string
  icon?: string
  link?: string
  external?: boolean
  pathMatch?: string
  home?: boolean
  admin?: boolean
  data: any
  children?: XpMenuItem[]
  hidden?: boolean
  // States
  expanded?: boolean
  isActive?: boolean
}
