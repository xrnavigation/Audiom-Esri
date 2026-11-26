/**
 * Whether the saved center belongs to the item now on screen.
 *
 * Settings and the canvas are different windows, so this has to live in
 * config. An empty marker means a new selection has not been read yet.
 * A saved config has no marker; its center belongs to the saved item, not
 * to a source the selector just connected.
 */
export function viewpointReadyForItem (
  itemId: string | undefined,
  viewpointItemId: string | null | undefined,
  savedItemId?: string
): boolean {
  if (!itemId) return false
  if (viewpointItemId === '') return false
  if (viewpointItemId === itemId) return true
  if (viewpointItemId == null) return !savedItemId || savedItemId === itemId
  return false
}
