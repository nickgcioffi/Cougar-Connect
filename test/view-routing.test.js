import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const script = await readFile(
  new URL("../js/shared/view-routing.js", import.meta.url),
  "utf8",
);

function preview({
  url = "https://www.cougarconnect.app/calendar?month=11#event-7",
  narrow = false,
  currentView = "desktop",
  cookiesEnabled = true,
} = {}) {
  const location = new URL(url);
  const redirects = [];
  let reloads = 0;
  let cookie = "";
  let resize;
  location.replace = (target) => redirects.push(target);
  location.reload = () => reloads++;
  const viewport = {
    matches: narrow,
    addEventListener: (event, callback) => {
      resize = callback;
    },
  };
  const document = {
    querySelector: () => ({ content: currentView }),
    get cookie() {
      return cookie;
    },
    set cookie(value) {
      if (cookiesEnabled) cookie = value;
    },
  };
  vm.runInNewContext(script, {
    window: { location, matchMedia: () => viewport },
    document,
    URL,
  });
  return {
    redirects,
    get reloads() {
      return reloads;
    },
    resize(matches) {
      viewport.matches = matches;
      resize?.();
    },
  };
}

test("narrow main-domain views redirect with path, query and fragment preserved", () => {
  const result = preview({ narrow: true });
  assert.deepEqual(result.redirects, [
    "https://mobile.cougarconnect.app/calendar?month=11#event-7",
  ]);
  const apex = preview({
    url: "https://cougarconnect.app/login?next=home#recovery",
    narrow: true,
  });
  assert.deepEqual(apex.redirects, [
    "https://mobile.cougarconnect.app/login?next=home#recovery",
  ]);
});

test("desktop stays on the main domain and crossing the breakpoint triggers routing", () => {
  const result = preview();
  assert.deepEqual(result.redirects, []);
  result.resize(true);
  assert.equal(result.redirects.length, 1);
});

test("explicit mobile hosts and view paths never redirect or reload", () => {
  for (const url of [
    "https://mobile.cougarconnect.app/home",
    "https://www.cougarconnect.app/views/desktop/login.html",
    "http://localhost:3000/views/mobile/login.html",
  ]) {
    const result = preview({ url, narrow: true });
    assert.deepEqual(result.redirects, []);
    assert.equal(result.reloads, 0);
  }
});

test("local viewport selection reloads only when needed and cookies are available", () => {
  const local = { url: "http://localhost:3000/home", narrow: true };
  assert.equal(preview(local).reloads, 1);
  assert.equal(preview({ ...local, currentView: "mobile" }).reloads, 0);
  assert.equal(preview({ ...local, cookiesEnabled: false }).reloads, 0);
  assert.equal(
    preview({ ...local, currentView: "mobile", narrow: false }).reloads,
    1,
  );
});
