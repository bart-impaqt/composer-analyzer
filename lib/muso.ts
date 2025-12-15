import { normalizeTitle } from "./helpers";

const MUSO_BASE = "https://api.muso.ai";

type CollaboratorsResponse = {
  data?: Record<string, any>;
};

/**
 * Split multiple artists from input string
 * Example: "Chavanté, Kleine John & Dopebwoy"
 */
function splitArtists(raw: string): string[] {
  return raw
    .split(/,|&| feat\.?| ft\.?/i)
    .map((a) => a.trim())
    .filter(Boolean);
}

/**
 * Resolve a Muso profile (artist entity)
 */
async function findMusoProfile(artist: string) {
  const params = new URLSearchParams({
    keyword: artist,
    type: "profile",
    limit: "5",
    offset: "0",
  });

  const res = await fetch(`${MUSO_BASE}/api/v4/search?${params.toString()}`, {
    headers: { "x-api-key": process.env.MUSO_API_KEY! },
  });

  if (!res.ok) return null;

  const data = await res.json();
  return data?.data?.profiles?.items?.[0] ?? null;
}

/**
 * Fetch tracks involving a specific profile, filtered by title
 */
async function findTracksViaProfile(profileId: string, title: string) {
  const params = new URLSearchParams({
    keyword: normalizeTitle(title),
    sortKey: "popularity",
    sortDirection: "DESC",
    limit: "10",
    offset: "0",
  });

  const res = await fetch(
    `${MUSO_BASE}/api/v4/profile/${profileId}/credits?${params.toString()}`,
    { headers: { "x-api-key": process.env.MUSO_API_KEY! } }
  );

  if (!res.ok) return [];

  const data = await res.json();

  return (
    data?.data?.items
      ?.map((i: any) => i.track)
      .filter(
        (t: any) =>
          t?.id && normalizeTitle(t.title).includes(normalizeTitle(title))
      ) ?? []
  );
}

/**
 * Load authoritative collaborators for a track
 */
async function loadMusoCollaborators(trackId: string) {
  const res = await fetch(
    `${MUSO_BASE}/api/w/v3/song/${trackId}/collaborators`,
    { headers: { "x-api-key": process.env.MUSO_API_KEY! } }
  );

  if (!res.ok) return null;

  const data = await res.json();
  return data?.data ?? null;
}

/**
 * MAIN — Find composers via Muso (profile-first approach)
 */
export async function findMusoComposers(artist: string, title: string) {
  console.log(`🎵 Muso lookup: "${artist}" – "${title}"`);

  const artistNames = splitArtists(artist);

  // 1️⃣ Resolve artist profiles
  const profiles = (await Promise.all(artistNames.map(findMusoProfile))).filter(
    Boolean
  );

  if (profiles.length === 0) {
    return [];
  }

  // 2️⃣ Fetch candidate tracks per profile
  const tracksPerProfile = await Promise.all(
    profiles.map((p: any) => findTracksViaProfile(p.id, title))
  );

  let finalTrack: any = null;

  // 3️⃣ Resolve correct track
  if (tracksPerProfile.length === 1) {
    finalTrack = tracksPerProfile[0][0];
  } else {
    // intersect track IDs across all artists
    const trackCount = new Map<string, { track: any; count: number }>();

    for (const tracks of tracksPerProfile) {
      for (const t of tracks) {
        if (!trackCount.has(t.id)) {
          trackCount.set(t.id, { track: t, count: 1 });
        } else {
          trackCount.get(t.id)!.count++;
        }
      }
    }

    finalTrack = [...trackCount.values()].find(
      (v) => v.count === tracksPerProfile.length
    )?.track;

    // fallback: primary artist best match
    if (!finalTrack) {
      finalTrack = tracksPerProfile[0][0];
    }
  }

  if (!finalTrack?.id) {
    return [];
  }

  // 4️⃣ Load collaborators (authoritative)
  const collaborators = await loadMusoCollaborators(finalTrack.id);
  if (!collaborators) return [];

  const songwritersBlock = collaborators.Songwriter ?? {};

  const composers: string[] = [];

  for (const role of ["Composer", "Lyricist", "Songwriter"]) {
    const entries = songwritersBlock[role];
    if (Array.isArray(entries)) {
      for (const p of entries) {
        if (p?.name) composers.push(p.name);
      }
    }
  }

  return [...new Set(composers)];
}
