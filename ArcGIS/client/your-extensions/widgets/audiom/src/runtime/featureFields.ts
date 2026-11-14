/**
 * Attribute names tried, in order, when a layer has no display field.
 * Service spelling varies. The label-expression list is a different order
 * with extra columns and must not be folded into this.
 */
export const DISPLAY_NAME_FIELDS = [
  'name', 'Name', 'NAME', 'title', 'Title', 'TITLE', 'label', 'Label', 'LABEL'
] as const
