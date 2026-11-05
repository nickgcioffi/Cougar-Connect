import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = process.argv[2];
if (!inputPath) {
  console.error(
    "Usage: node scripts/import-byu-clubs-events.js <scraped-events.json>",
  );
  process.exit(2);
}

const dataPath = resolve(root, "data/byu-clubs-events.json");
const incomingValue = JSON.parse(await readFile(resolve(inputPath), "utf8"));
const incoming = Array.isArray(incomingValue) ? incomingValue : [incomingValue];
const existing = JSON.parse(await readFile(dataPath, "utf8"));
const byKey = new Map(existing.map((event) => [event.sourceKey, event]));

function normalize(event) {
  const eventId = String(event.sourceKey || "").match(/^byu-clubs:(\d+)$/)?.[1];
  const sourceUrl = new URL(event.sourceUrl);
  if (
    !eventId ||
    sourceUrl.hostname !== "clubs.byu.edu" ||
    !sourceUrl.pathname.endsWith(`/link/event/${eventId}`) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(event.date) ||
    !/^\d{2}:\d{2}$/.test(event.startTime) ||
    (event.endTime && !/^\d{2}:\d{2}$/.test(event.endTime)) ||
    !event.title?.trim() ||
    !event.location?.trim()
  ) {
    throw new Error(
      `Invalid BYU Clubs event: ${event.title || event.sourceKey || "(untitled)"}`,
    );
  }
  const hash = createHash("sha256")
    .update(event.sourceKey)
    .digest("hex")
    .slice(0, 12);
  return {
    id: -Number.parseInt(hash, 16) - 1,
    title: event.title.trim(),
    organization: event.organization?.trim() || "BYU Clubs",
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime || "",
    location: event.location.trim(),
    description: event.description?.trim() || "",
    sourceUrl: sourceUrl.href,
    sourceKey: event.sourceKey,
  };
}

for (const event of incoming) {
  const normalized = normalize(event);
  byKey.set(normalized.sourceKey, normalized);
}

await mkdir(dirname(dataPath), { recursive: true });
await writeFile(dataPath, `${JSON.stringify([...byKey.values()], null, 2)}\n`);
console.log(
  `Imported ${incoming.length} event(s); ${byKey.size} unique event(s) stored locally.`,
);
