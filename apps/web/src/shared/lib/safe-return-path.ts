export function safeReturnPath(value: string | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  ) {
    return "/projets";
  }
  return value;
}
