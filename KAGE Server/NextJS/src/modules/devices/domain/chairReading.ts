/**
 * A reading is stale when it comes from the same boot as the last one we
 * applied and its sequence number is not newer. A reboot starts a new boot id
 * (and a fresh counter), so it is never judged against the old sequence.
 */
export function isStaleReading(
  chair: { lastBoot: string | null; lastSeq: number | null },
  reading: { boot?: string; seq?: number },
): boolean {
  const sameBoot = reading.boot !== undefined && reading.boot === chair.lastBoot;
  return (
    sameBoot && reading.seq !== undefined && chair.lastSeq !== null && reading.seq <= chair.lastSeq
  );
}
