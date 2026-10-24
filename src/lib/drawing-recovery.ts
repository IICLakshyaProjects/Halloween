export const recoveryKey = (attemptId: string) => `hw_recovery_${attemptId}`;

export function clearRecoveryCopies() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith("hw_recovery_"))
      .forEach((key) => localStorage.removeItem(key));
  } catch {}
}
