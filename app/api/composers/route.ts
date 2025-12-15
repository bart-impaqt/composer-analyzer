import { findSpotifyISRC } from "@/lib/spotify";
import {
  findRecordingByISRC,
  findRecordingByText,
  loadRecordingDetails,
  extractComposersFromRecording,
  loadWork,
  extractComposersFromWork,
  findWorkLucene,
  findWorkAdvanced,
  findParentWorkComposers,
} from "@/lib/musicbrainz";
import { clean, logStep } from "@/lib/helpers";
import { findMusoComposers } from "@/lib/muso";

export async function POST(req: Request) {
  const { rows } = await req.json();
  const results: any[] = [];

  for (const row of rows) {
    let [artistRaw, titleRaw] = row.includes(" - ")
      ? row.split(" - ")
      : row.split("\t");

    const artist = clean(artistRaw);
    const title = clean(titleRaw);

    logStep("--------------------------------------------");
    logStep("🔍 Track:", artist, "-", title);

    let composers: string[] = [];
    let isrc = null;
    let recording = null;

    try {
      //
      // STEP -1 — MUSO AI (authoritative publishers data)
      //
      logStep("🎵 Trying Muso AI…");

      const musoComposers = await findMusoComposers(artist, title);

      if (!musoComposers) {
        results.push({
          artist,
          title,
          isrc: null,
          source: "MUSO",
          composers: "Unrecognized track",
        });
      }

      if (musoComposers && musoComposers.length > 0) {
        logStep("✅ Muso composers:", musoComposers);

        results.push({
          artist,
          title,
          isrc: null,
          source: "MUSO",
          composers: musoComposers,
        });

        continue; // ⛔ stop here, skip Spotify + MusicBrainz
      }

      
      // STEP 0 — Direct Work search FIRST (NEW)
      
      // logStep("🎯 Trying direct MB WORK search (Lucene)…");
      // const work = await findWorkAdvanced(title, artist);

      // if (work) {
      //   const workDetails = await loadWork(work.id);
      //   composers = extractComposersFromWork(workDetails);

      //   if (composers.length > 0) {
      //     logStep("🎼 Found composers directly from WORK:", composers);

      //     results.push({
      //       artist,
      //       title,
      //       isrc: null,
      //       mbRecordingId: null,
      //       composers,
      //     });

      //     continue;
      //   }
      // }

      //
      // STEP 1 — Spotify → ISRC
      //
      // const spotify = await findSpotifyISRC(artist, title);

      // if (spotify?.isrc) {
      //   isrc = spotify.isrc;
      //   recording = await findRecordingByISRC(isrc);
      // }

      //
      // STEP 2 — fallback to recording text search
      //
      // if (!recording) {
      //   logStep("⚠️ ISRC failed — using recording text search…");
      //   recording = await findRecordingByText(artist, title);
      // }

      // if (!recording) {
      //   results.push({
      //     artist,
      //     title,
      //     isrc,
      //     composers: ["NOT FOUND"],
      //   });
      //   continue;
      // }

      //
      // STEP 3 — detailed recording info
      //
      // const details = await loadRecordingDetails(recording.id);
      // composers = extractComposersFromRecording(details);

      // if (composers.length > 0) {
      //   logStep("🎼 Extracted from RECORDING:", composers);
      // }

      //
      // STEP 4 — try WORK via recording
      //
      // if (composers.length === 0) {
      //   // @ts-expect-error Ignore TS error for now
      //   const recWorks = details.relations?.filter(
      //     (r: any) => r.type === "performance" && r.work
      //   );

      //   if (recWorks?.length > 0) {
      //     const workId = recWorks[0].work.id;

      //     const workDetails = await loadWork(workId);
      //     let workComposers = extractComposersFromWork(workDetails);

      //     if (workComposers.length === 0) {
      //       workComposers = await findParentWorkComposers(workDetails);
      //     }
      //   }
      // }

      // results.push({
      //   artist,
      //   title,
      //   isrc,
      //   mbRecordingId: recording?.id ?? null,
      //   composers: composers.length ? composers : ["NONE LISTED"],
      // });
    } catch (err: any) {
      console.error("❌ ERROR:", err);
      results.push({
        artist,
        title,
        isrc,
        composers: ["ERROR"],
        error: String(err),
      });
    }
  }

  return Response.json({ results });
}
