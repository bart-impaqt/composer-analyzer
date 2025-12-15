export function clean(text: string) {
  if (!text) return "";
  return text
    .normalize("NFC")
    .replace(/^"|"$/g, "")
    .replace(/[�]/g, "é")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitArtists(artist: string): string[] {
  return artist
    .replace(/ feat\.?/i, ";")
    .replace(/ ft\.?/i, ";")
    .split(/[;,]/)
    .map((a) => clean(a))
    .filter(Boolean);
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, "") // remove (feat. …)
    .replace(/\[.*?\]/g, "") // remove [remix]
    .replace(/-.*$/g, "") // remove "- remix"
    .replace(/[^\p{L}\p{N}\s]/gu, "") // ⬅ removes commas safely
    .replace(/\s+/g, " ")
    .trim();
}

export function logStep(...msg: any[]) {
  console.log("🎵 [ComposerFinder]", ...msg);
}

export function normalizeArtistName(name: string) {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[,.-]/g, "")
    .replace(/\b(feat|ft|featuring)\b.*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreMatch(
  overlap: string[],
  titleMatch: boolean,
  musoTitle: string,
  inputTitle: string
) {
  let score = 0;

  // Artist overlap
  score += overlap.length * 10;

  // Title
  if (musoTitle === inputTitle) score += 30;
  else if (titleMatch) score += 15;

  // Penalize remix / cover
  if (/remix|cover|version|live/i.test(musoTitle)) {
    score -= 10;
  }

  return score;
}