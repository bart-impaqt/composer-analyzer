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

export function normalizeTitle(title: string) {
  return title
    .replace(/\(.*?\)/g, "")
    .replace(/[{}[\]']/g, "")
    .replace(/feat\..*/i, "")
    .replace(/ft\..*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function logStep(...msg: any[]) {
  console.log("🎵 [ComposerFinder]", ...msg);
}
