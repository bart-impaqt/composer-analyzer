import { findGeniusComposers } from "@/lib/genius";
import { clean, logStep } from "@/lib/helpers";

type ComposerResult = {
  artist: string;
  title: string;
  isrc: string | null;
  source?: string;
  composers: string[];
  error?: string;
};

const composerCache = new Map<string, string[]>();

function trimCsvNoise(value: string) {
  return value.replace(/(?:,\s*)+$/g, "").trim();
}

function parseInputRow(row: string) {
  const cleanedRow = clean(row.replace(/^\uFEFF/, ""));
  const dashIndex = cleanedRow.indexOf(" - ");

  if (dashIndex >= 0) {
    return {
      artist: trimCsvNoise(clean(cleanedRow.slice(0, dashIndex))),
      title: trimCsvNoise(clean(cleanedRow.slice(dashIndex + 3))),
    };
  }

  const tabParts = cleanedRow.split("\t");
  return {
    artist: trimCsvNoise(clean(tabParts[0] ?? "")),
    title: trimCsvNoise(clean(tabParts[1] ?? "")),
  };
}

function cacheKey(artist: string, title: string) {
  return `${artist.toLowerCase()}::${title.toLowerCase()}`;
}

function getFromCache(artist: string, title: string) {
  return composerCache.get(cacheKey(artist, title)) ?? null;
}

function setInCache(artist: string, title: string, composers: string[]) {
  composerCache.set(cacheKey(artist, title), composers);
}

async function resolveComposers(
  artist: string,
  title: string
): Promise<{ composers: string[]; source: string }> {
  const cached = getFromCache(artist, title);
  if (cached) {
    logStep("Cache hit:", artist, "-", title);
    return { composers: cached, source: "CACHE" };
  }

  logStep("Trying Genius...");
  const geniusComposers = await findGeniusComposers(artist, title);

  if (geniusComposers.length > 0) {
    logStep("Genius composers:", geniusComposers);
    setInCache(artist, title, geniusComposers);
    return { composers: geniusComposers, source: "GENIUS" };
  }

  setInCache(artist, title, ["NOT FOUND"]);
  return { composers: ["NOT FOUND"], source: "GENIUS" };
}

export async function POST(req: Request) {
  const body = (await req.json()) as { rows?: unknown };
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const results: ComposerResult[] = [];

  for (const row of rows) {
    const { artist, title } = parseInputRow(String(row ?? ""));
    if (!artist && !title) continue;

    logStep("--------------------------------------------");
    logStep("Track:", artist, "-", title);

    try {
      const { composers, source } = await resolveComposers(artist, title);
      results.push({ artist, title, isrc: null, source, composers });
    } catch (err: unknown) {
      console.error("ERROR:", err);
      results.push({
        artist,
        title,
        isrc: null,
        composers: ["ERROR"],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({ results });
}
