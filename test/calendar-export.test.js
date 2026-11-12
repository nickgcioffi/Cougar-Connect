import { eventTimestamp } from "../js/shared/event-time.js";
import test from "node:test";
import assert from "node:assert/strict";
import { openEvent } from "../js/shared/events.js";

function exportDates(event) {
  let opened;
  const elements = new Map();
  const dialog = { innerHTML: "", showModal() {}, close() {} };
  globalThis.document = {
    querySelector(selector) {
      if (selector === "#detail") return dialog;
      if (selector === "#eventReviewForm") return null;
      if (!elements.has(selector)) elements.set(selector, {});
      return elements.get(selector);
    },
  };
  globalThis.window = {
    open(url) {
      opened = new URL(url);
    },
  };
  openEvent({ events: [event], saved: [] }, event.id, async () => {});
  elements.get("#googleCalendar").onclick();
  assert.equal(opened.searchParams.get("text"), event.name);
  assert.equal(opened.searchParams.get("location"), event.location);
  return opened.searchParams.get("dates");
}

test("calendar export dates", async (t) => {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    tz: process.env.TZ,
  };
  const event = {
    id: 1,
    name: "Test event",
    date: "2030-01-15",
    time: "18:00:00",
    location: "Campus",
    org: "Test Club",
    desc: "Details",
    genre: "Tech",
  };
  try {
    process.env.TZ = "America/Denver";
    await t.test(
      "Mountain Time winter exports convert to UTC with the default one-hour duration",
      () => {
        assert.equal(exportDates(event), "20300116T010000Z/20300116T020000Z");
      },
    );
    await t.test(
      "Mountain Time summer exports use daylight time and the specified end time",
      () => {
        assert.equal(
          exportDates({ ...event, date: "2030-07-15", endTime: "20:30:00" }),
          "20300716T000000Z/20300716T023000Z",
        );
      },
    );
    await t.test(
      "exports keep Mountain Time event instants for clients in another timezone",
      () => {
        process.env.TZ = "UTC";
        assert.equal(exportDates(event), "20300116T010000Z/20300116T020000Z");
      },
    );
    await t.test(
      "spring transition uses the correct offsets on each side of the gap",
      () => {
        assert.equal(
          exportDates({
            ...event,
            date: "2030-03-10",
            time: "01:30:00",
            endTime: "03:30:00",
          }),
          "20300310T083000Z/20300310T093000Z",
        );
      },
    );
    await t.test(
      "fall transition includes the repeated hour in an explicit duration",
      () => {
        assert.equal(
          exportDates({
            ...event,
            date: "2030-11-03",
            time: "00:30:00",
            endTime: "02:30:00",
          }),
          "20301103T063000Z/20301103T093000Z",
        );
      },
    );
    await t.test(
      "nonexistent spring times are rejected and the first fall occurrence is deterministic",
      () => {
        assert.throws(
          () => eventTimestamp("2030-03-10", "02:30:00"),
          /does not exist/,
        );
        assert.equal(
          eventTimestamp("2030-11-03", "01:30:00").toISOString(),
          "2030-11-03T07:30:00.000Z",
        );
      },
    );
  } finally {
    for (const name of ["document", "window"]) {
      if (previous[name] === undefined) delete globalThis[name];
      else globalThis[name] = previous[name];
    }
    if (previous.tz === undefined) delete process.env.TZ;
    else process.env.TZ = previous.tz;
  }
});
