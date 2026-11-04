/**
 * Loose enough to survive the punctuation drift between the three databases —
 * "WALL·E" vs "WALL-E", "Am&eacute;lie" vs "Amelie", trailing articles left alone.
 */
export function normalise(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
