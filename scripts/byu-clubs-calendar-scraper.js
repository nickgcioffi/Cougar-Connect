// Run in DevTools on the public BYU Clubs calendar. This clicks rendered
// calendar items and reads their public detail pages; it never calls /xas/.
(async () => {
  if (location.pathname !== "/link/events") {
    throw new Error("Open https://clubs.byu.edu/link/events first.");
  }

  const waitFor = async (predicate, label) => {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${label}.`);
  };

  const readEvent = () => {
    const pageText = document.body.innerText;
    const title = document.querySelector("h1, h2")?.textContent?.trim();
    const details = pageText.match(
      /Date:\s*([^\n]+)\s+Time:\s*([^\n]+)\s+Location:\s*([^\n]+)/i,
    );
    const eventId = location.pathname.match(/\/link\/event\/(\d+)/)?.[1];
    if (!title || !details || !eventId) {
      throw new Error("Event detail page did not contain all expected fields.");
    }
    const date = new Date(details[1].trim());
    if (Number.isNaN(date.getTime())) throw new Error("Could not parse date.");
    const isoDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const times = [
      ...details[2].matchAll(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/gi),
    ];
    if (!times.length) throw new Error("Could not parse start time.");
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
    const organization = pageText
      .match(/Hosting Club:\s*\n?([^\n]+)/i)?.[1]
      ?.trim();
    return {
      title,
      organization: organization || "BYU Clubs",
      date: isoDate,
      startTime: toTime(times[0]),
      endTime: times[1] ? toTime(times[1]) : "",
      location: details[3].trim(),
      description,
      sourceUrl: location.href,
      sourceKey: `byu-clubs:${eventId}`,
    };
  };

  const initialCount = document.querySelectorAll(".rbc-event-content").length;
  if (!initialCount) throw new Error("No rendered calendar events were found.");
  const events = new Map();
  const failures = [];

  for (let index = 0; index < initialCount; index++) {
    try {
      await waitFor(
        () =>
          document.querySelectorAll(".rbc-event-content").length >=
          initialCount,
        "calendar events",
      );
      const item = document.querySelectorAll(".rbc-event-content")[index];
      if (!item) continue;
      const eventElement = item.closest(".rbc-event");
      const propsKey = Object.keys(eventElement || {}).find((key) =>
        key.startsWith("__reactProps$"),
      );
      const onClick = eventElement?.[propsKey]?.onClick;
      if (typeof onClick !== "function")
        throw new Error("Calendar item click handler not found.");
      onClick.call(
        eventElement,
        new MouseEvent("click", { bubbles: true, cancelable: true, view: window }),
      );
      await waitFor(
        () => /\/link\/event\/\d+$/.test(location.pathname),
        "event detail page",
      );
      await waitFor(
        () => document.body.innerText.includes("Event Details"),
        "event details",
      );
      const event = readEvent();
      events.set(event.sourceKey, event);
    } catch (error) {
      failures.push(`Calendar item ${index + 1}: ${error.message}`);
    } finally {
      if (/\/link\/event\/\d+$/.test(location.pathname)) {
        history.back();
        try {
          await waitFor(
            () => location.pathname === "/link/events",
            "calendar page after event",
          );
        } catch (error) {
          failures.push(error.message);
          break;
        }
      }
    }
  }

  const output = JSON.stringify([...events.values()], null, 2);
  console.log(
    `Scraped ${events.size} unique events from ${initialCount} calendar items.`,
  );
  if (failures.length)
    console.warn("Some items could not be scraped:", failures);
  if (typeof copy === "function") copy(output);
  const download = document.createElement("a");
  download.href = URL.createObjectURL(
    new Blob([output], { type: "application/json" }),
  );
  download.download = "byu-clubs-scraped.json";
  download.click();
  setTimeout(() => URL.revokeObjectURL(download.href), 1000);
  console.log(
    typeof copy === "function"
      ? "JSON copied to the clipboard and downloaded:"
      : "JSON downloaded; copy the printed output if needed:",
  );
  console.log(output);
  return [...events.values()];
})();
