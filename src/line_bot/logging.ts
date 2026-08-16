export function formatLineMessageLog(userId: string | undefined, text: string): string {
  const maskedUserId = userId ? `${userId.slice(0, 8)}***` : "unknown";
  return `LINE message received from ${maskedUserId} (${text.length}文字)`;
}
