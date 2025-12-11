import { MusicBrainzApi } from "musicbrainz-api";
import { clean, splitArtists, normalizeTitle, logStep } from "./helpers";

const mb = new MusicBrainzApi({
  appName: "ComposerAnalyzer",
  appVersion: "1.0.0",
  appContactInfo: "bart@domain.com",
  rateLimit: [1, 1],
});

const WRITER_TYPES = [
  "composer",
  "lyricist",
  "writer",
  "author",
  "librettist",
  "arranger",
  "orchestrator",
  "based on",
  "based on work",
  "composer of",
  "writer of",
  "poet",
];

// -----------------------
// NEW: WORK LOOKUP
// -----------------------
export async function loadWork(workId: string) {
  logStep("MB lookup WORK:", workId);
  return await mb.lookup("work", workId, [
    "artist-rels",
    "work-rels",
    "recording-rels",
    "artist-credits",
  ]);
}

// -----------------------
// SEARCH BY ISRC
// -----------------------
export async function findRecordingByISRC(isrc: string) {
  try {
    logStep("MB search by ISRC:", isrc);
    const res = await mb.search("recording", {
      query: { isrc },
      limit: 5,
    });
    return res.recordings?.[0] ?? null;
  } catch (e) {
    console.error("❌ MB ISRC search error:", e);
    return null;
  }
}

// -----------------------
// FALLBACK TEXT SEARCH
// -----------------------
export async function findRecordingByText(artist: string, title: string) {
  const artists = splitArtists(artist);
  const normTitle = normalizeTitle(title);

  for (const a of artists) {
    try {
      logStep("MB search:", normTitle, "| artist:", a);
      const res = await mb.search("recording", {
        query: { name: normTitle, artist: a },
        limit: 5,
      });
      if (res.recordings?.length) return res.recordings[0];
    } catch {}
  }

  return null;
}

// -----------------------
// FULL DETAILS FOR RECORDING
// -----------------------
export async function loadRecordingDetails(mbid: string) {
  logStep("MB lookup RECORDING:", mbid);
  return await mb.lookup("recording", mbid, [
    "artist-credits",
    "artist-rels",
    "work-rels",
    "recording-rels",
    "work-level-rels",
    "work-rels",
  ]);
}

// -----------------------
// COMPOSER EXTRACTOR
// -----------------------
export function extractComposersFromRecording(details: any) {
  const composers = new Set<string>();

  extractNamesFromRelations(details.relations, composers);

  // Work relations inside recording
  details.relations?.forEach((rel: any) => {
    if (rel.work?.relations) {
      extractNamesFromRelations(rel.work.relations, composers);
    }
  });

  // Credits
  details["artist-credit"]?.forEach((ac: any) => {
    if (WRITER_TYPES.includes(ac.type)) {
      composers.add(clean(ac.name));
    }
  });

  return [...composers];
}

function extractNamesFromRelations(relations: any[], composers: Set<string>) {
  if (!relations) return;

  for (const rel of relations) {
    if (WRITER_TYPES.includes(rel.type)) {
      if (rel.artist?.name) {
        composers.add(clean(rel.artist.name));
      }
    }
  }
}

// -----------------------
// NEW: WORK-LEVEL COMPOSER EXTRACTION
// -----------------------
export function extractComposersFromWork(work: any) {
  const composers = new Set<string>();

  if (work.relations) {
    for (const rel of work.relations) {
      if (WRITER_TYPES.includes(rel.type)) {
        if (rel.artist?.name) {
          composers.add(clean(rel.artist.name));
        }
      }
    }
  }

  return [...composers];
}

export async function findParentWorkComposers(workDetails: any): Promise<string[]> {
  const parent = workDetails.relations?.find(
    (r: any) => r.type === "parts" && r.direction === "backward"
  );

  if (!parent?.work?.id) return [];

  const parentDetails = await loadWork(parent.work.id);
  return extractComposersFromWork(parentDetails);
}

export async function findWorkByText(title: string, artist: string) {
  try {
    const res = await mb.search("work", {
      query: { name: title, artist },
      limit: 5,
    });
    return res.works?.[0] || null;
  } catch {
    return null;
  }
}

export async function findWorkLucene(title: string, artist: string) {
  const q = `work:"${title}" AND artist:"${artist}"`;

  logStep("MB Work Lucene search:", q);

  try {
    const res = await mb.search("work", {
      query: q,
      limit: 5,
    });

    return res.works?.[0] ?? null;
  } catch (e) {
    console.error("❌ Work search error:", e);
    return null;
  }
}

export async function findWorkAdvanced(title: string, artist: string) {
  const artists = splitArtists(artist);
  const titleClean = clean(title);
  const titleNorm = normalizeTitle(title);

  const queries = [];

  // 1. Exact title + each individual artist
  for (const a of artists) {
    queries.push(`work:"${titleClean}" AND artist:"${a}"`);
    queries.push(`work:"${titleNorm}" AND artist:"${a}"`);
  }

  // 2. Exact title, no artist
  queries.push(`work:"${titleClean}"`);
  queries.push(`work:"${titleNorm}"`);

  // 3. Fuzzy title search
  queries.push(`work:${titleClean}~`);
  queries.push(`work:${titleNorm}~`);

  for (const q of queries) {
    try {
      logStep("MB Work Search:", q);

      const res = await mb.search("work", {
        query: q,
        limit: 5,
      });

      if (res.works?.length > 0) {
        logStep("MATCHED WORK:", res.works[0].id);
        return res.works[0];
      }
    } catch (err) {
      console.error("❌ MB Work search error:", err);
    }
  }

  return null;
}
