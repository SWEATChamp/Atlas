/**
 * Shared dialog coordinator.
 * Coordinates automatic dialogs across the application to prevent simultaneous competing overlays
 * and coordinates deferred dialogs (such as the Subject controls guide) to automatically open
 * during the same session/visit once a blocking dialog (such as What's New) is dismissed.
 */

type Listener = () => void

class DialogCoordinator {
  private releaseDismissListeners: Set<Listener> = new Set()

  /**
   * Subscribe a callback to be notified when the release notification modal is dismissed.
   * Returns an unsubscribe cleanup function.
   */
  subscribeReleaseDismissal(listener: Listener): () => void {
    this.releaseDismissListeners.add(listener)
    return () => {
      this.releaseDismissListeners.delete(listener)
    }
  }

  /**
   * Notify all registered listeners that the release notification modal was dismissed.
   */
  notifyReleaseDismissed(): void {
    this.releaseDismissListeners.forEach((listener) => {
      try {
        listener()
      } catch (err) {
        // Prevent listener errors from breaking other subscriptions
        console.error('Error in dialog coordinator listener:', err)
      }
    })
  }

  /**
   * Clears all listeners (used in testing).
   */
  reset(): void {
    this.releaseDismissListeners.clear()
  }
}

export const dialogCoordinator = new DialogCoordinator()
