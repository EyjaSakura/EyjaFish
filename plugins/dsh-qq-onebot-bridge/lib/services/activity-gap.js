// Pure helper for the 1C silent-activity interval.
export function nextActivityGapMinutes(random = Math.random) {
  return 120 + Math.floor(random() * 120)
}
