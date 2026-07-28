export type DestructiveConfirmation = {
  confirmed: boolean
  pendingId: string | null
}

export function advanceDestructiveConfirmation(
  pendingId: string | null,
  requestedId: string,
): DestructiveConfirmation {
  if (pendingId === requestedId) {
    return { confirmed: true, pendingId: null }
  }
  return { confirmed: false, pendingId: requestedId }
}
