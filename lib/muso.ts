import { normalizeTitle } from "./helpers";

const MUSO_BASE = "https://api.muso.ai/api/v4";
const MUSO_API_KEY = process.env.MUSO_API_KEY;
const TARGET_ROLES = ["composer", "lyricist", "songwriter"] as const;
let musoBlockedReason: string | null = null;

type MusoTrack = {
  id: string;
  title: string;
};

function detectCloudflareBlock(
  status: number,
  contentType: string | null,
  body: string
): string | null {
  if (status !== 403) return null;

  const text = body.slice(0, 2000);
  const htmlLike = (contentType ?? "").toLowerCase().includes("text/html");
  const cloudflareLike =
    /cloudflare/i.test(text) ||
    /attention required/i.test(text) ||
    /you have been blocked/i.test(text);

  if (!htmlLike || !cloudflareLike) return null;
  return "Access blocked by Cloudflare/WAF. Ask Muso to allowlist your server/IP and API key.";
}

export function getMusoBlockedReason(): string | null {
  return musoBlockedReason;
}

function musoHeaders(contentTypeJson = false): HeadersInit {
  return contentTypeJson
    ? {
        "x-api-key": MUSO_API_KEY ?? "",
        "Content-Type": "application/json",
      }
    : { "x-api-key": MUSO_API_KEY ?? "" };
}

/**
 * Split multiple artists from input string
 * Example: "Chavante, Kleine John & Dopebwoy"
 */
function splitArtists(raw: string): string[] {
  return raw
    .split(/,|&| feat\.?| ft\.?/i)
    .map((a) => a.trim())
    .filter(Boolean);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function musoGet(
  path: string,
  params?: URLSearchParams
): Promise<unknown | null> {
  if (musoBlockedReason) return null;

  const url = `${MUSO_BASE}${path}${params ? `?${params.toString()}` : ""}`;
  const res = await fetch(url, { headers: musoHeaders() });

  if (!res.ok) {
    const body = await res.text();
    const blockReason = detectCloudflareBlock(
      res.status,
      res.headers.get("content-type"),
      body
    );
    if (blockReason) {
      musoBlockedReason = blockReason;
      console.error(`[Muso] ${blockReason}`);
      return null;
    }
    console.warn(`[Muso] GET ${path} failed (${res.status}) ${body.slice(0, 200)}`);
    return null;
  }

  const text = await res.text();
  return parseJsonSafe(text);
}

async function musoPost(
  path: string,
  payload: Record<string, unknown>
): Promise<unknown | null> {
  if (musoBlockedReason) return null;

  const url = `${MUSO_BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: musoHeaders(true),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    const blockReason = detectCloudflareBlock(
      res.status,
      res.headers.get("content-type"),
      body
    );
    if (blockReason) {
      musoBlockedReason = blockReason;
      console.error(`[Muso] ${blockReason}`);
      return null;
    }
    console.warn(`[Muso] POST ${path} failed (${res.status}) ${body.slice(0, 200)}`);
    return null;
  }

  const text = await res.text();
  return parseJsonSafe(text);
}

function parseSearchProfiles(payload: unknown): Record<string, unknown>[] {
  const root = asRecord(payload);
  if (!root) return [];

  const topProfiles = asRecord(root.profiles);
  const data = asRecord(root.data);
  const dataProfiles = asRecord(data?.profiles);

  return asArray(topProfiles?.items ?? dataProfiles?.items)
    .map(asRecord)
    .filter((p): p is Record<string, unknown> => Boolean(p));
}

function parseProfileCreditItems(payload: unknown): unknown[] {
  const root = asRecord(payload);
  if (!root) return [];

  const data = asRecord(root.data);
  return asArray(data?.items ?? root.items);
}

function titleLooksLikeMatch(inputTitle: string, candidateTitle: string): boolean {
  const input = normalizeTitle(inputTitle);
  const candidate = normalizeTitle(candidateTitle);
  if (!input || !candidate) return false;

  return (
    candidate === input ||
    candidate.includes(input) ||
    input.includes(candidate)
  );
}

function parseTrackFromCreditItem(item: unknown): MusoTrack | null {
  const rawItem = asRecord(item);
  if (!rawItem) return null;

  const rawTrack = asRecord(rawItem.track) ?? rawItem;
  const id = asString(rawTrack.id);
  const title = asString(rawTrack.title);

  if (!id || !title) return null;
  return { id, title };
}

function hasTargetRoleToken(token: string): boolean {
  const normalized = token.toLowerCase().trim();
  return TARGET_ROLES.some(
    (role) => normalized === role || normalized.includes(role)
  );
}

function addRoleToken(tokens: string[], value: unknown) {
  const text = asString(value);
  if (text) {
    tokens.push(text);
    return;
  }

  const obj = asRecord(value);
  if (!obj) return;

  const nested =
    asString(obj.name) ??
    asString(obj.role) ??
    asString(obj.credit) ??
    asString(obj.type) ??
    asString(obj.category) ??
    asString(obj.creditType);

  if (nested) tokens.push(nested);
}

function collectRoleTokens(node: Record<string, unknown>): string[] {
  const tokens: string[] = [];

  addRoleToken(tokens, node.role);
  addRoleToken(tokens, node.credit);
  addRoleToken(tokens, node.type);
  addRoleToken(tokens, node.category);
  addRoleToken(tokens, node.creditType);
  addRoleToken(tokens, node.childCredit);

  for (const role of asArray(node.roles)) addRoleToken(tokens, role);
  for (const childCredit of asArray(node.childCredits)) {
    addRoleToken(tokens, childCredit);
  }

  return tokens;
}

function addName(names: Set<string>, value: unknown) {
  const text = asString(value);
  if (!text) return;

  const name = text.trim();
  if (!name) return;
  if (hasTargetRoleToken(name)) return;

  names.add(name);
}

function addEntityNames(node: Record<string, unknown>, names: Set<string>) {
  addName(names, node.name);
  addName(names, asRecord(node.profile)?.name);
  addName(names, asRecord(node.person)?.name);
  addName(names, asRecord(node.entity)?.name);

  for (const profile of asArray(node.profiles)) {
    addName(names, asRecord(profile)?.name);
  }
}

function collectComposerNames(
  node: unknown,
  inheritedRoleMatch: boolean,
  names: Set<string>
) {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectComposerNames(item, inheritedRoleMatch, names);
    }
    return;
  }

  const current = asRecord(node);
  if (!current) return;

  const roleMatch =
    inheritedRoleMatch ||
    collectRoleTokens(current).some((token) => hasTargetRoleToken(token));

  if (roleMatch) {
    addEntityNames(current, names);
  }

  for (const value of Object.values(current)) {
    if (value !== null && typeof value === "object") {
      collectComposerNames(value, roleMatch, names);
    }
  }
}

/**
 * Resolve a Muso profile (artist entity)
 */
async function findMusoProfile(
  artist: string
): Promise<Record<string, unknown> | null> {
  const data = await musoPost("/search", {
    keyword: artist,
    type: ["profile"],
    limit: 5,
    offset: 0,
  });

  if (!data) return null;

  const profiles = parseSearchProfiles(data);
  return profiles.find((profile) => asString(profile.id)) ?? null;
}

/**
 * Fetch tracks involving a specific profile, filtered by title
 */
async function findTracksViaProfile(
  profileId: string,
  title: string
): Promise<MusoTrack[]> {
  const params = new URLSearchParams({
    keyword: title,
    sortKey: "popularity",
    sortDirection: "DESC",
    limit: "10",
    offset: "0",
  });

  const data = await musoGet(`/profile/${profileId}/credits`, params);
  if (!data) return [];

  const tracks = parseProfileCreditItems(data)
    .map(parseTrackFromCreditItem)
    .filter((track): track is MusoTrack => Boolean(track));

  return tracks.filter((track) => titleLooksLikeMatch(title, track.title));
}

/**
 * Load songwriters/composers from documented v4 track details
 */
async function loadTrackComposers(trackId: string): Promise<string[]> {
  const payload = await musoGet(`/track/id/${trackId}`);
  if (!payload) return [];

  const root = asRecord(payload);
  if (!root) return [];

  const data = asRecord(root.data) ?? root;
  const creditsNode = data.credits ?? data.collaborators ?? data;

  const names = new Set<string>();
  collectComposerNames(creditsNode, false, names);

  return [...names];
}

/**
 * MAIN - Find composers via Muso (profile-first approach)
 */
export async function findMusoComposers(
  artist: string,
  title: string
): Promise<string[]> {
  console.log(`[Muso] lookup: "${artist}" - "${title}"`);

  if (musoBlockedReason) {
    return [];
  }

  if (!MUSO_API_KEY) {
    console.warn("[Muso] MUSO_API_KEY is missing");
    return [];
  }

  const artistNames = splitArtists(artist);

  // 1) Resolve artist profiles
  const profiles = (await Promise.all(artistNames.map(findMusoProfile))).filter(
    (profile): profile is Record<string, unknown> => Boolean(profile)
  );

  if (profiles.length === 0) {
    return [];
  }

  // 2) Fetch candidate tracks per profile
  const tracksPerProfile = await Promise.all(
    profiles.map((profile) => {
      const profileId = asString(profile.id);
      return profileId ? findTracksViaProfile(profileId, title) : [];
    })
  );

  let finalTrack: MusoTrack | null = null;

  // 3) Resolve correct track
  if (tracksPerProfile.length === 1) {
    finalTrack = tracksPerProfile[0][0] ?? null;
  } else {
    // intersect track IDs across all artists
    const trackCount = new Map<string, { track: MusoTrack; count: number }>();

    for (const tracks of tracksPerProfile) {
      for (const track of tracks) {
        if (!trackCount.has(track.id)) {
          trackCount.set(track.id, { track, count: 1 });
        } else {
          const existing = trackCount.get(track.id);
          if (existing) existing.count++;
        }
      }
    }

    finalTrack =
      [...trackCount.values()].find((entry) => entry.count === tracksPerProfile.length)
        ?.track ?? null;

    // fallback: primary artist best match
    if (!finalTrack) {
      finalTrack = tracksPerProfile[0][0] ?? null;
    }
  }

  if (!finalTrack?.id) {
    return [];
  }

  // 4) Load track details and extract songwriter credits
  return loadTrackComposers(finalTrack.id);
}
