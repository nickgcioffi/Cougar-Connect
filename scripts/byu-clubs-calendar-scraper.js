// Run in DevTools on the public BYU Clubs calendar. It uses the public list
// view and event detail pages; it never calls /xas/.
(async () => {
  if (location.pathname !== "/link/events") {
    throw new Error("Open https://clubs.byu.edu/link/events first.");
  }

  const waitFor = async (predicate, label, timeout = 12000) => {
    const deadline = Date.now() + timeout;
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
    const dateText = details[1].trim().replace(/^[A-Za-z]+,\s*/, "");
    const dateParts = dateText.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
    const months = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ];
    const month = dateParts
      ? months.findIndex((name) => name.startsWith(dateParts[1].toLowerCase()))
      : -1;
    const day = Number(dateParts?.[2]);
    const year = Number(dateParts?.[3]);
    const parsedDate = new Date(Date.UTC(year, month, day));
    if (
      month < 0 ||
      parsedDate.getUTCFullYear() !== year ||
      parsedDate.getUTCMonth() !== month ||
      parsedDate.getUTCDate() !== day
    ) {
      throw new Error("Could not parse date.");
    }
    const isoDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

  // Only use an explicit year to skip a card. Ambiguous dates are checked
  // on the detail page instead of guessing a year or the list's sort order.
  const dateFromText = (text) => {
    const cleaned = text
      .trim()
      .replace(/^Date:\s*/i, "")
      .replace(
        /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+/i,
        "",
      );
    const iso = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})(?:T\S+)?$/);
    const numeric = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const named = cleaned.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
    const months = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ];
    let year, month, day;
    if (iso) {
      [, year, month, day] = iso.map(Number);
      month -= 1;
    } else if (numeric) {
      month = Number(numeric[1]) - 1;
      day = Number(numeric[2]);
      year = Number(numeric[3]);
    } else if (named) {
      month = months.findIndex((name) =>
        name.startsWith(named[1].toLowerCase()),
      );
      day = Number(named[2]);
      year = Number(named[3]);
    } else {
      return null;
    }
    const date = new Date(Date.UTC(year, month, day));
    if (
      month < 0 ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month ||
      date.getUTCDate() !== day
    )
      return null;
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };
  const cardDate = (item) => {
    const time = item.querySelector("time[datetime]");
    if (time) return dateFromText(time.getAttribute("datetime"));
    const title = item.querySelector("h1, h2, h3, h4")?.innerText || "";
    const dates = item.innerText
      .replace(title, "")
      .split("\n")
      .map(dateFromText)
      .filter(Boolean);
    return new Set(dates).size === 1 ? dates[0] : null;
  };
  const cardMonth = (item) => {
    // The public cards show e.g. DATE\nTuesday, September 8 12:00 PM.
    // A month outside the two-month window can be excluded without a year.
    // Cards in either target month still need their detail date verified.
    const dateLabel = item.innerText.match(
      /(?:^|\n)DATE\s*:?\s*([^\n]+)/i,
    )?.[1];
    const named = dateLabel?.match(
      /^(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+)?(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})\b/i,
    );
    if (!named || Number(named[2]) < 1 || Number(named[2]) > 31) return null;
    return [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(named[1].slice(0, 3).toLowerCase());
  };

  const itemSelector = '.widget-gallery-item[role="listitem"]';
  const listToggleSelector = 'button[aria-label="view as list"]';
  const pageInfo = () =>
    document.body.innerText.match(
      /Currently showing\s+(\d+)\s+to\s+(\d+)\s+of\s+(\d+)/i,
    );
  const pageNumbers = () => {
    const match = pageInfo();
    if (!match) throw new Error("Could not read the event-list page status.");
    const [, first, last, total] = match;
    return {
      first: Number(first),
      last: Number(last),
      total: Number(total),
      size: Number(last) - Number(first) + 1,
    };
  };
  const findPageButton = (label) =>
    [...document.querySelectorAll("button")].find((button) =>
      [button.getAttribute("aria-label"), button.title, button.innerText]
        .filter(Boolean)
        .some((value) => value.trim().toLowerCase() === label.toLowerCase()),
    );
  const waitForList = () =>
    waitFor(
      () =>
        document.body.innerText.includes("Upcoming Events") &&
        !document.body.innerText.includes("More Events From this Club") &&
        document.querySelectorAll(itemSelector).length > 0 &&
        pageInfo(),
      "public event list",
    );
  const openList = async () => {
    if (
      document.body.innerText.includes("Upcoming Events") &&
      !document.body.innerText.includes("More Events From this Club") &&
      document.querySelectorAll(itemSelector).length &&
      pageInfo()
    )
      return;
    const toggle = document.querySelector(listToggleSelector);
    if (!toggle)
      throw new Error("Could not find the calendar's list-view control.");
    toggle.click();
    await waitForList();
  };
  const checkpointKey = "byu-clubs-crawl-v2";
  const maxDetailVisits = 10;
  if (window.byuClubsCrawler?.running) {
    throw new Error(
      "A crawl is already running. Use byuClubsCrawler.stop() first.",
    );
  }
  const now = new Date();
  const dateKey = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const windowStart = dateKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const windowEnd = dateKey(new Date(now.getFullYear(), now.getMonth() + 2, 0));
  const inWindow = (date) => date >= windowStart && date <= windowEnd;
  const windowMonths = new Set([now.getMonth(), (now.getMonth() + 1) % 12]);
  const events = new Map();
  const failures = [];
  const stats = { cardsChecked: 0, skippedByDate: 0, detailsOpened: 0 };
  let checkpoint;
  let stopRequested = false;
  let status = "paused";
  const control = {
    running: true,
    stop() {
      stopRequested = true;
      console.info(
        "Stop requested; finishing the current event and saving progress.",
      );
    },
    reset() {
      if (control.running)
        throw new Error("Stop the running crawl before resetting.");
      sessionStorage.removeItem(checkpointKey);
      sessionStorage.removeItem("byu-clubs-crawl-v1");
      console.info(
        "Progress reset. Run the updated script again to start over.",
      );
    },
  };
  window.byuClubsCrawler = control;
  const onStopKey = (event) => {
    if (!["q", "escape"].includes(event.key.toLowerCase())) return;
    if (
      event.key.toLowerCase() === "q" &&
      (event.target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName))
    )
      return;
    control.stop();
  };
  const saveProgress = () => {
    checkpoint.events = [...events.values()];
    sessionStorage.setItem(checkpointKey, JSON.stringify(checkpoint));
  };
  document.addEventListener("keydown", onStopKey);
  try {
    await openList();
    if (pageNumbers().first !== 1) {
      const firstButton = findPageButton("Go to first page");
      if (!firstButton)
        throw new Error("Could not return to the first list page.");
      firstButton.click();
      await waitFor(() => pageNumbers().first === 1, "first list page");
    }
    const firstPage = pageNumbers();
    if (!firstPage.size || !firstPage.total)
      throw new Error("The public event list is empty.");
    const pageCount = Math.ceil(firstPage.total / firstPage.size);
    const goToPage = async (targetIndex) => {
      let current = pageNumbers();
      let index = Math.floor((current.first - 1) / firstPage.size);
      if (index > targetIndex) {
        const firstButton = findPageButton("Go to first page");
        if (!firstButton)
          throw new Error("Could not return to the first list page.");
        firstButton.click();
        await waitFor(() => pageNumbers().first === 1, "first list page");
        current = pageNumbers();
        index = 0;
      }
      while (index < targetIndex) {
        const before = current.first;
        const nextButton = findPageButton("Go to next page");
        if (!nextButton || nextButton.disabled)
          throw new Error("Could not advance the event list.");
        nextButton.click();
        await waitFor(() => pageNumbers().first > before, "next list page");
        current = pageNumbers();
        index++;
      }
      if (current.total !== firstPage.total)
        throw new Error("The event list changed; reset and rerun the crawl.");
      return current;
    };
    try {
      checkpoint = JSON.parse(sessionStorage.getItem(checkpointKey) || "null");
    } catch {
      checkpoint = null;
    }
    if (
      !checkpoint ||
      checkpoint.total !== firstPage.total ||
      checkpoint.windowStart !== windowStart ||
      checkpoint.windowEnd !== windowEnd ||
      !Array.isArray(checkpoint.events) ||
      !Number.isInteger(checkpoint.nextPage) ||
      !Number.isInteger(checkpoint.nextItem)
    ) {
      checkpoint = {
        total: firstPage.total,
        windowStart,
        windowEnd,
        nextPage: 0,
        nextItem: 0,
        complete: false,
        events: [],
      };
    }
    for (const event of checkpoint.events) {
      if (inWindow(event.date)) events.set(event.sourceKey, event);
    }
    saveProgress();
    console.info(
      `Date window: ${windowStart} through ${windowEnd}. Up to ${maxDetailVisits} detail visits per run.`,
    );
    console.info(
      "Click the webpage and press Q or Escape to stop, or run byuClubsCrawler.stop() in the console.",
    );
    if (checkpoint.complete) {
      status = "complete";
      console.info(
        "This date-window crawl is already complete. Reset progress to scan again.",
      );
    } else {
      console.info(
        `Resuming at list page ${checkpoint.nextPage + 1}, item ${checkpoint.nextItem + 1}. Reload preserves progress; byuClubsCrawler.reset() clears it.`,
      );
      crawl: while (checkpoint.nextPage < pageCount) {
        if (stopRequested) {
          status = "stopped";
          break;
        }
        const pageIndex = checkpoint.nextPage;
        await openList();
        const currentPage = await goToPage(pageIndex);
        const itemCount = document.querySelectorAll(itemSelector).length;
        if (!itemCount)
          throw new Error("No event cards found on the list page.");
        console.info(`Checking list page ${pageIndex + 1} of ${pageCount}.`);
        for (
          let itemIndex = checkpoint.nextItem;
          itemIndex < itemCount;
          itemIndex++
        ) {
          // Yield so a stop key also works while skipping cards without navigation.
          await new Promise((resolve) => setTimeout(resolve, 0));
          if (stopRequested) {
            status = "stopped";
            break crawl;
          }
          const item = document.querySelectorAll(itemSelector)[itemIndex];
          if (!item) throw new Error("Event card disappeared from the list.");
          const label = item.innerText.replace(/\s+/g, " ").trim().slice(0, 90);
          const date = cardDate(item);
          const month = date ? null : cardMonth(item);
          stats.cardsChecked++;
          if (
            date ? !inWindow(date) : month !== null && !windowMonths.has(month)
          ) {
            stats.skippedByDate++;
            console.info(
              `Skipped ${date || `month ${month + 1}`} outside the date window: ${label}`,
            );
          } else {
            if (stats.detailsOpened >= maxDetailVisits) break crawl;
            console.info(
              `Opening event ${currentPage.first + itemIndex} of ${currentPage.total}${date ? "" : " to verify its date"}: ${label}`,
            );
            stats.detailsOpened++;
            item.click();
            await waitFor(
              () => /\/link\/event\/\d+$/.test(location.pathname),
              "event detail page",
              5000,
            );
            await waitFor(
              () => document.body.innerText.includes("Event Details"),
              "event details",
            );
            const event = readEvent();
            if (inWindow(event.date)) {
              events.set(event.sourceKey, event);
              console.info(`Collected ${event.title} (${event.date}).`);
            } else {
              stats.skippedByDate++;
              console.info(
                `Skipped ${event.title}: ${event.date} is outside the date window.`,
              );
            }
            // Save before returning so reloading cannot discard a parsed event.
            checkpoint.nextItem = itemIndex + 1;
            saveProgress();
            window.history.back();
            await waitFor(
              () =>
                location.pathname === "/link/events" &&
                document.body.innerText.includes("Upcoming Events") &&
                !document.body.innerText.includes("More Events From this Club"),
              "main calendar page",
            );
            await openList();
            if (
              !stopRequested &&
              stats.detailsOpened < maxDetailVisits &&
              itemIndex + 1 < itemCount
            ) {
              await goToPage(pageIndex);
            }
          }
          checkpoint.nextItem = itemIndex + 1;
          if (checkpoint.nextItem === itemCount) {
            checkpoint.nextPage = pageIndex + 1;
            checkpoint.nextItem = 0;
          }
          saveProgress();
          if (stopRequested) {
            status = "stopped";
            break crawl;
          }
          if (stats.detailsOpened >= maxDetailVisits) break crawl;
        }
        // A reload can resume with the final item already saved.
        if (checkpoint.nextPage === pageIndex) {
          checkpoint.nextPage = pageIndex + 1;
          checkpoint.nextItem = 0;
          saveProgress();
        }
      }
      if (checkpoint.nextPage >= pageCount) {
        checkpoint.complete = true;
        status = "complete";
      }
      saveProgress();
    }
  } catch (error) {
    status = "failed";
    failures.push(error.message);
    console.error(`Crawl stopped: ${error.message}`);
    if (checkpoint) saveProgress();
  } finally {
    document.removeEventListener("keydown", onStopKey);
    control.running = false;
  }

  const report = {
    status,
    windowStart,
    windowEnd,
    ...stats,
    collected: events.size,
    failures,
  };
  control.report = report;
  console.info("Crawl result:", report);
  if (checkpoint && !checkpoint.complete) {
    console.info(
      `Progress saved at page ${checkpoint.nextPage + 1}, item ${checkpoint.nextItem + 1}. Rerun this script in the same tab to continue.`,
    );
  }
  if (events.size) {
    const output = JSON.stringify([...events.values()], null, 2);
    const download = document.createElement("a");
    download.href = URL.createObjectURL(
      new Blob([output], { type: "application/json" }),
    );
    download.download = "byu-clubs-scraped.json";
    download.click();
    setTimeout(() => URL.revokeObjectURL(download.href), 1000);
    console.log("JSON downloaded:", output);
  } else {
    console.warn(
      status === "complete"
        ? "No events matched this date window after checking the full public list. No empty JSON file was downloaded."
        : "No matching events collected yet. Check the crawl result and saved position above. No empty JSON file was downloaded.",
    );
  }
  return { ...report, events: [...events.values()] };
})();
