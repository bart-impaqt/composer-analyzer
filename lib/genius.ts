import { clean, logStep } from "@/lib/helpers";

const GENIUS_API_BASE = "https://api.genius.com";
const GENIUS_TOKEN = process.env.GENIUS_ACCESS_TOKEN;

function geniusHeaders() {
  return {
    Authorization: `Bearer ${GENIUS_TOKEN}`,
    "User-Agent": "ComposerAnalyzer/1.0",
  };
}

// Normalise a string for loose comparison — lowercase, strip punctuation & extra spaces
function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Return true if the Genius hit is a plausible match for our artist + title.
// Genius search can return loosely related results, so we guard against false positives.
function isGoodMatch(hit: any, artist: string, title: string): boolean {
  const hitTitle = normalize(hit.title ?? "");
  const hitArtist = normalize(hit.primary_artist?.name ?? "");
  const queryTitle = normalize(title);
  const queryArtist = normalize(artist);

  const titleMatch =
    hitTitle.includes(queryTitle) || queryTitle.includes(hitTitle);

  // Accept if the primary artist matches OR if the query artist appears anywhere
  // in the full title string (handles "feat." situations)
  const fullTitle = normalize(hit.full_title ?? "");
  const artistMatch =
    hitArtist.includes(queryArtist) ||
    queryArtist.includes(hitArtist) ||
    fullTitle.includes(queryArtist);

  return titleMatch && artistMatch;
}

// -----------------------
// STEP 1 — Search for the song and return the Genius song ID
// -----------------------
async function searchGeniusSong(
  artist: string,
  title: string,
): Promise<number | null> {
  const q = encodeURIComponent(`${title} ${artist}`);
  const url = `${GENIUS_API_BASE}/search?q=${q}`;

  logStep("Genius search:", title, "|", artist);

  const res = await fetch(url, { headers: geniusHeaders() });
  if (!res.ok) {
    console.error("❌ Genius search failed:", res.status, await res.text());
    return null;
  }

  const data = await res.json();
  const hits: any[] = data.response?.hits ?? [];

  // Find the first song hit that passes our match guard
  for (const hit of hits) {
    if (hit.type !== "song") continue;
    if (isGoodMatch(hit.result, artist, title)) {
      logStep(
        "✅ Genius match:",
        hit.result.full_title,
        "| id:",
        hit.result.id,
      );
      return hit.result.id as number;
    }
  }

  logStep("⚠️ No Genius match found for:", artist, "-", title);
  return null;
}

// -----------------------
// STEP 2 — Fetch full song detail and extract writer_artists
// -----------------------
async function fetchGeniusSongDetail(songId: number): Promise<string[]> {
  const url = `${GENIUS_API_BASE}/songs/${songId}`;
  logStep("Genius song detail:", songId);

  const res = await fetch(url, { headers: geniusHeaders() });
  if (!res.ok) {
    console.error("❌ Genius song detail failed:", res.status);
    return [];
  }

  const data = await res.json();
  const song = data.response?.song;

  if (!song) return [];

  // writer_artists is the credited writers list — this is what we want
  const writers: string[] = (song.writer_artists ?? []).map((w: any) =>
    clean(w.name),
  );

  // producer_artists is a separate array — ignore unless you want producers too
  logStep("🎼 Genius writers:", writers);
  return writers;
}

// -----------------------
// PUBLIC: find composers via Genius
// -----------------------
export async function findGeniusComposers(
  artist: string,
  title: string,
): Promise<string[]> {
  if (!GENIUS_TOKEN) {
    console.error("❌ GENIUS_ACCESS_TOKEN is not set");
    return [];
  }

  try {
    const songId = await searchGeniusSong(artist, title);
    if (!songId) return [];

    const writers = await fetchGeniusSongDetail(songId);
    return writers;
  } catch (err) {
    console.error("❌ Genius lookup error:", err);
    return [];
  }
}
