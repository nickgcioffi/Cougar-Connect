import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../scripts/byu-clubs-calendar-scraper.js", import.meta.url),
  "utf8",
);

function browser(
  events,
  { pageSize = 2, now = "2026-11-05T12:00:00Z", onOpen } = {},
) {
  const storage = new Map();
  const listeners = new Map();
  const opened = [];
  const downloads = [];
  const messages = [];
  let page = 0;
  let view = "list";
  let current;
  let openHook = onOpen;
  const location = {
    pathname: "/link/events",
    get href() {
      return `https://clubs.byu.edu${this.pathname}`;
    },
  };
  const formatDate = (date) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  const button = (label, click, disabled = false) => ({
    title: label,
    innerText: "",
    disabled,
    click,
    getAttribute: (name) => (name === "aria-label" ? label : null),
  });
  const document = {
    body: {
      get innerText() {
        if (view === "detail")
          return `${current.title}\nDescription\nEvent Details\nDate: ${formatDate(current.date)}\nTime: 6 PM - 7 PM\nLocation: Campus\nHosting Club: Test Club`;
        if (view === "month") return "Upcoming Events";
        return `Upcoming Events\nCurrently showing ${page * pageSize + 1} to ${Math.min((page + 1) * pageSize, events.length)} of ${events.length}`;
      },
    },
    querySelector(selector) {
      if (selector === "h1, h2" && view === "detail")
        return { textContent: current.title };
      if (
        selector === 'button[aria-label="view as list"]' &&
        view !== "detail"
      ) {
        return button("view as list", () => {
          view = "list";
        });
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "button" && view === "list")
        return [
          button("Go to first page", () => {
            page = 0;
          }),
          button(
            "Go to next page",
            () => {
              page++;
            },
            (page + 1) * pageSize >= events.length,
          ),
        ];
      if (
        selector !== '.widget-gallery-item[role="listitem"]' ||
        view !== "list"
      )
        return [];
      return events
        .slice(page * pageSize, (page + 1) * pageSize)
        .map((event) => ({
          innerText: `${event.title}\n${event.cardText ?? event.date}`,
          querySelector(selector) {
            if (selector === "time[datetime]" && !event.cardText)
              return { getAttribute: () => event.date };
            if (selector === "h1, h2, h3, h4")
              return { innerText: event.title };
            return null;
          },
          click() {
            opened.push(event.id);
            openHook?.(event, (key) =>
              listeners.get("keydown")?.({ key, target: { tagName: "BODY" } }),
            );
            current = event;
            view = "detail";
            location.pathname = `/link/event/${event.id}`;
          },
        }));
    },
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
    createElement: () => ({ click() {} }),
  };
  class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return Date.parse(now);
    }
  }
  const window = {
    history: {
      back() {
        view = "month";
        page = 0;
        location.pathname = "/link/events";
      },
    },
  };
  const context = vm.createContext({
    window,
    document,
    location,
    Date: FixedDate,
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    console: Object.fromEntries(
      ["info", "warn", "error", "log"].map((level) => [
        level,
        (...args) => messages.push({ level, args }),
      ]),
    ),
    setTimeout: (fn) => {
      fn();
      return 0;
    },
    Blob: class {
      constructor(parts) {
        this.text = parts.join("");
      }
    },
    URL: {
      createObjectURL: (blob) => {
        downloads.push(JSON.parse(blob.text));
        return "blob:test";
      },
      revokeObjectURL() {},
    },
  });
  return {
    run: () => vm.runInContext(source, context),
    opened,
    downloads,
    messages,
    window,
    storage,
    setOpenHook: (fn) => {
      openHook = fn;
    },
    reload: () => {
      view = "month";
      page = 0;
      location.pathname = "/link/events";
    },
  };
}
const event = (id, date, extra = {}) => ({
  id,
  date,
  title: `Event ${id}`,
  ...extra,
});

test("passes empty pages and out-of-order dates to collect both target months", async () => {
  const app = browser([
    event(1, "2027-01-02"),
    event(2, "2027-02-02"),
    event(3, "2026-09-02"),
    event(4, "2026-11-12"),
    event(5, "2026-12-31"),
  ]);
  const result = await app.run();
  assert.equal(result.status, "complete");
  assert.equal(result.collected, 2);
  assert.equal(result.skippedByDate, 3);
  assert.deepEqual(app.opened, [4, 5]);
  assert.equal(app.downloads[0].length, 2);
});

test("Escape saves the current event and resumes after reload without reopening it", async () => {
  const app = browser([event(1, "2026-11-12"), event(2, "2026-12-12")], {
    onOpen: (_, key) => key("Escape"),
  });
  const stopped = await app.run();
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.collected, 1);
  assert.equal(app.downloads[0].length, 1);
  app.setOpenHook(null);
  app.reload();
  const resumed = await app.run();
  assert.equal(resumed.status, "complete");
  assert.equal(resumed.collected, 2);
  assert.deepEqual(app.opened, [1, 2]);
});

test("limits detail visits and resumes a later list page with accumulated data", async () => {
  const app = browser(
    Array.from({ length: 14 }, (_, i) => event(i + 1, "2026-11-12")),
  );
  const batch = await app.run();
  assert.equal(batch.status, "paused");
  assert.equal(batch.detailsOpened, 10);
  assert.equal(batch.collected, 10);
  const rest = await app.run();
  assert.equal(rest.status, "complete");
  assert.equal(rest.collected, 14);
  assert.equal(app.opened.length, 14);
  assert.equal(new Set(app.opened).size, 14);
});

test("checks detail dates when a card omits its year instead of guessing", async () => {
  const app = browser([
    event(1, "2027-11-12", { cardText: "Nov 12" }),
    event(2, "2026-11-12", { cardText: "Nov 12" }),
  ]);
  const result = await app.run();
  assert.equal(result.collected, 1);
  assert.deepEqual(app.opened, [1, 2]);
  assert.equal(app.downloads[0][0].sourceKey, "byu-clubs:2");
});

test("skips the live site's yearless September labels without spending the detail budget", async () => {
  const old = Array.from({ length: 12 }, (_, i) =>
    event(i + 1, "2026-09-08", {
      cardText:
        "BYUSA Clubs Area\nDATE\nTuesday, September 8 12:00 PM\nLOCATION\nBrigham Square",
    }),
  );
  const app = browser([
    ...old,
    event(13, "2026-11-12", {
      cardText:
        "Test Club\nDATE\nThursday, November 12 6:00 PM\nLOCATION\nCampus",
    }),
    event(14, "2027-11-12", {
      cardText:
        "Test Club\nDATE\nFriday, November 12 6:00 PM\nLOCATION\nCampus",
    }),
    event(15, "2026-12-12", {
      cardText:
        "Test Club\nDATE\nSaturday, December 12 6:00 PM\nLOCATION\nCampus",
    }),
  ]);
  const result = await app.run();
  assert.equal(result.status, "complete");
  assert.equal(result.detailsOpened, 3);
  assert.equal(result.collected, 2);
  assert.deepEqual(app.opened, [13, 14, 15]);
  assert.equal(app.downloads[0].length, 2);
});

test("yearless month filtering handles December to January", async () => {
  const app = browser(
    [
      event(1, "2026-11-12", {
        cardText: "DATE\nThursday, November 12 6:00 PM",
      }),
      event(2, "2026-12-12", {
        cardText: "DATE\nSaturday, December 12 6:00 PM",
      }),
      event(3, "2027-01-12", { cardText: "DATE\nTuesday, January 12 6:00 PM" }),
      event(4, "2027-02-12", { cardText: "DATE\nFriday, February 12 6:00 PM" }),
    ],
    { now: "2026-12-05T12:00:00Z" },
  );
  await app.run();
  assert.deepEqual(app.opened, [2, 3]);
});

test("reports a fully scanned empty window without downloading an empty file", async () => {
  const app = browser([event(1, "2026-09-12"), event(2, "2027-01-12")]);
  const result = await app.run();
  assert.equal(result.status, "complete");
  assert.equal(result.collected, 0);
  assert.equal(app.downloads.length, 0);
  app.reload();
  assert.equal((await app.run()).cardsChecked, 0);
  app.window.byuClubsCrawler.reset();
  assert.equal((await app.run()).cardsChecked, 2);
});

test("current month plus one includes January across the year boundary", async () => {
  const app = browser(
    [
      event(1, "2026-11-30"),
      event(2, "2026-12-01"),
      event(3, "2027-01-31"),
      event(4, "2027-02-01"),
    ],
    { now: "2026-12-05T12:00:00Z" },
  );
  const result = await app.run();
  assert.equal(result.windowStart, "2026-12-01");
  assert.equal(result.windowEnd, "2027-01-31");
  assert.deepEqual(app.opened, [2, 3]);
});

test("navigation failures are reported instead of producing an empty download", async () => {
  const app = browser([event(1, "2026-11-12")], {
    onOpen: () => {
      throw new Error("Navigation failed");
    },
  });
  const result = await app.run();
  assert.equal(result.status, "failed");
  assert.equal(result.failures[0], "Navigation failed");
  assert.equal(app.downloads.length, 0);
  assert.equal(app.window.byuClubsCrawler.running, false);
});
