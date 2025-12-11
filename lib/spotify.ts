import { clean } from "./helpers";

let spotifyToken: string | null = null;
let spotifyTokenExpiresAt = 0;

function primaryArtist(artist: string) {
  return clean(
    artist
      .replace(/ feat\.?/i, ";")
      .replace(/ ft\.?/i, ";")
      .split(/[;,]/)[0]
  );
}

async function getSpotifyToken(): Promise<string> {
  const now = Date.now();

  if (spotifyToken && now < spotifyTokenExpiresAt - 60_000) {
    return spotifyToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    console.error("❌ Spotify token error", res.status);
    throw new Error("Spotify token request failed");
  }

  const data = await res.json();
  spotifyToken = data.access_token;
  spotifyTokenExpiresAt = now + data.expires_in * 1000;

  return spotifyToken!;
}

export async function findSpotifyISRC(artistRaw: string, titleRaw: string) {
  const token = await getSpotifyToken();

  const artist = primaryArtist(artistRaw);
  const title = clean(titleRaw);

  const q = `track:${title} artist:${artist}`;

  const url =
    "https://api.spotify.com/v1/search?" +
    new URLSearchParams({
      q,
      type: "track",
      limit: "5",
    });

  console.log("🔎 Spotify search:", q);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.error("❌ Spotify search error", res.status);
    return null;
  }

  const data = await res.json();
  const track = data?.tracks?.items?.[0];

  if (!track) {
    console.log("⚠️ No Spotify match");
    return null;
  }

  const isrc = track?.external_ids?.isrc;

  console.log("🎯 Spotify match:", track.name, "→ ISRC:", isrc);

  if (!isrc) return null;

  return {
    isrc,
    spotifyId: track.id,
    spotifyTrackName: track.name,
    spotifyArtistName: track.artists.map((a: any) => a.name).join(", "),
  };
}
