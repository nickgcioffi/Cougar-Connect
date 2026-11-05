// Run on a public BYU Clubs event detail page. It reads rendered page content
// only; it does not call the site's Mendix /xas/ endpoints.
(() => {
  const pageText = document.body.innerText;
  const title = document.querySelector("h1, h2")?.textContent?.trim();
  const details = pageText.match(
    /Date:\s*([^\n]+)\s+Time:\s*([^\n]+)\s+Location:\s*([^\n]+)/i,
  );
  const eventId = location.pathname.match(/\/link\/event\/(\d+)/)?.[1];
  if (!title || !details || !eventId) {
    throw new Error(
      "Open a public event detail page and confirm it shows Date, Time, and Location.",
    );
  }

  const date = new Date(details[1].trim());
  if (Number.isNaN(date.getTime()))
    throw new Error("Could not parse event date.");
  const isoDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const times = [...details[2].matchAll(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/gi)];
  if (times.length < 1) throw new Error("Could not parse event start time.");
  const toTime = (match) => {
    let hour = Number(match[1]) % 12;
    if (match[3].toUpperCase() === "PM") hour += 12;
    return `${String(hour).padStart(2, "0")}:${match[2] || "00"}`;
  };
  const titleIndex = pageText.indexOf(title);
  const detailsIndex = pageText.indexOf("Event Details", titleIndex);
  const description = pageText
    .slice(
      titleIndex + title.length,
      detailsIndex < 0 ? undefined : detailsIndex,
    )
    .trim();
  const hostingClub = pageText
    .match(/Hosting Club:\s*\n?([^\n]+)/i)?.[1]
    ?.trim();
  const event = {
    title,
    organization: hostingClub || "BYU Clubs",
    date: isoDate,
    startTime: toTime(times[0]),
    endTime: times[1] ? toTime(times[1]) : "",
    location: details[3].trim(),
    description,
    sourceUrl: location.href,
    sourceKey: `byu-clubs:${eventId}`,
  };
  console.log(
    "Copy this event JSON into a .json file for the Cougar Connect importer:",
  );
  console.log(JSON.stringify([event], null, 2));
  return event;
})();
