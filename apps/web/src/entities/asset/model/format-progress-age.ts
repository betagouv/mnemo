const relativeTime = new Intl.RelativeTimeFormat("fr", { numeric: "always" });

export function formatProgressAge(updatedAt: string, now: number) {
  // A worker clock slightly ahead of the browser must not produce a future age.
  const seconds = Math.max(0, (now - Date.parse(updatedAt)) / 1_000);
  if (seconds < 60) return "à l'instant";
  if (seconds < 3_600)
    return relativeTime.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86_400)
    return relativeTime.format(-Math.floor(seconds / 3_600), "hour");
  return relativeTime.format(-Math.floor(seconds / 86_400), "day");
}
