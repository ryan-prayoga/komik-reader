/**
 * Shared bottom banner slot for InstallPrompt + UpdatePrompt.
 * Both are full-width fixed bars above BottomNav — only one may occupy the slot.
 * Priority: Update > Install (SW update is time-critical; install can wait).
 */
let updateActive = $state(false);

export function setUpdatePromptActive(active: boolean) {
	updateActive = active;
}

export function isUpdatePromptActive() {
	return updateActive;
}
