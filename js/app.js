const $ = (s) => document.querySelector(s),
  interests = [
    "Career & networking",
    "Technology",
    "Entrepreneurship",
    "Service",
    "Arts & culture",
    "Sports & outdoors",
    "Research",
    "Social & community",
  ];
const seed = [
  {
    id: 1,
    name: "Meet your next opportunity",
    org: "Business Career Center",
    genre: "Career & networking",
    type: "Professional",
    location: "Tanner Building",
    day: 29,
    time: "17:00",
    icon: "↗",
    desc: "Connect with alumni and explore internships at an informal career networking night. Bring your questions and a little curiosity.",
  },
  {
    id: 2,
    name: "Build night: ideas into action",
    org: "Association for Information Systems",
    genre: "Technology",
    type: "Professional",
    location: "Tanner Building",
    day: 30,
    time: "18:00",
    icon: "⌘",
    desc: "Team up with other students for a hands-on project workshop. All experience levels are welcome.",
  },
  {
    id: 3,
    name: "A little service. A big difference.",
    org: "Y-Serve",
    genre: "Service",
    type: "Social",
    location: "Wilkinson Student Center",
    day: 28,
    time: "16:00",
    icon: "♡",
    desc: "Spend an afternoon assembling community care kits and meeting fellow student volunteers.",
  },
  {
    id: 4,
    name: "Founders & fresh ideas",
    org: "Entrepreneurship Club",
    genre: "Entrepreneurship",
    type: "Professional",
    location: "Tanner Building",
    day: 30,
    time: "12:00",
    icon: "✧",
    desc: "Hear student founders share what they learned building their first ventures.",
  },
  {
    id: 5,
    name: "An evening of live music",
    org: "Student Activities",
    genre: "Arts & culture",
    type: "Social",
    location: "Brigham Square",
    day: 29,
    time: "19:00",
    icon: "♫",
    desc: "Take a study break with student musicians and friends at an outdoor concert.",
  },
].map((e) => ({ ...e, date: `2026-09-${e.day}` }));
let state;
try {
  state = JSON.parse(localStorage.getItem("cougar-demo"));
} catch {}
state = state || {
  profile: null,
  interests: [],
  saved: [],
  launch: "Home",
  events: seed,
};
state.events = state.events || seed;
let tab =
    state.profile && state.interests.length >= 3 ? state.launch : "Profile",
  chosen = [...state.interests],
  month = 8,
  year = 2026,
  filters = {},
  query = "";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const persist = () => {
  try {
    localStorage.setItem("cougar-demo", JSON.stringify(state));
  } catch {
    toast("Your browser could not save this demo.");
  }
};
const toast = (t) => {
  $("#toast").textContent = t;
  $("#toast").style.display = "block";
  clearTimeout(window.tt);
  window.tt = setTimeout(() => ($("#toast").style.display = "none"), 3500);
};
const options = (a, v) =>
  a
    .map((x) => `<option ${x === v ? "selected" : ""}>${esc(x)}</option>`)
    .join("");
const time = (e) =>
  new Date(`${e.date}T${e.time}`).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
const date = (e) =>
  new Date(e.date + "T12:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
function card(e) {
  return `<button class="card" data-event="${e.id}"><div class="cardTop"><span class="date">${date(e).split(" ")[0].toUpperCase()}<strong>${Number(e.date.slice(-2))}</strong></span><span class="eventIcon">${esc(e.icon || "↗")}</span></div><div class="cardBody"><span class="tag">${esc(e.genre)}</span><h3>${esc(e.name)}</h3><p>${time(e)} · ${esc(e.location)}</p><div class="cardFoot">${esc(e.org)} <span style="float:right">${state.saved.includes(e.id) ? "♥ Saved" : "♡"}</span></div></div></button>`;
}
function cards(a) {
  return a.length
    ? `<div class="cards">${a.map(card).join("")}</div>`
    : '<div class="panel empty">No events found. Try another category or save an event to see it here.</div>';
}
function setup(content, step) {
  return `<div class="setup"><aside class="intro"><div><div class="eyebrow">YOUR CAMPUS. YOUR NEXT CHAPTER.</div><h1>Good things<br>happen when<br>you show up.</h1><p>Discover the people, experiences, and opportunities that make your time at BYU count.</p></div><div class="introFoot">A connection today.<br>A possibility for tomorrow.</div></aside><section class="formside"><div class="steps"><span class="on"></span><span class="${step === 2 ? "on" : ""}"></span></div>${content}</section></div>`;
}
function render() {
  $("#nav").innerHTML = ["Profile", "Interests"].includes(tab)
    ? ""
    : ["Home", "Calendar", "Search", "Feed", "Settings"]
        .map(
          (t, i) =>
            `<button data-tab="${t}" class="${tab === t ? "active" : ""}"><span>${["⌂", "▦", "⌕", "▤", "⚙"][i]}</span>${t}</button>`,
        )
        .join("");
  $("#profileBadge").textContent = state.profile
    ? state.profile.name
        .split(" ")
        .map((x) => x[0])
        .join("")
        .slice(0, 2)
    : "Y";
  let html = "";
  if (tab === "Profile")
    html = setup(
      `<div class="eyebrow">STEP 01 / 02</div><h2 style="margin-top:8px">Make yourself at home.</h2><p>Start with a little about you.</p><form id="profileForm"><div class="upload"><img class="avatar" id="avatarPreview" alt="Profile photo" hidden><span class="avatar" id="avatarPlaceholder">＋</span><label>Profile photo <span class="subtle">(optional)</span><input id="photo" type="file" accept="image/*"></label></div><label>Full name<input name="name" placeholder="e.g. Jordan Miller" required maxlength="80" value="${esc(state.profile?.name || "")}"></label><label>University<select name="uni">${options(["Brigham Young University", "BYU–Idaho", "BYU–Hawaii", "Other"], state.profile?.uni)}</select></label><div class="row"><label>Study level<select name="level">${options(["Undergraduate", "Graduate"], state.profile?.level)}</select></label><label>Graduation date<input name="graduation" type="month" required value="${esc(state.profile?.graduation || "2027-04")}"></label></div><label>Primary interest<select name="interest">${options(interests, state.profile?.interest)}</select></label><label>Bio <span class="subtle">(optional)</span><textarea name="bio" placeholder="What are you hoping to get involved in?" maxlength="400">${esc(state.profile?.bio || "")}</textarea></label><button class="primary wide">Create profile →</button><p class="subtle" style="margin:12px 0 0">Coursework demo · Profile stays in this browser. No account is created.</p></form>`,
      1,
    );
  if (tab === "Interests")
    html = setup(
      `<div class="eyebrow">STEP 02 / 02</div><h2 style="margin-top:8px">What draws you in?</h2><p>Pick at least three interests. We’ll help you find your kind of campus events.</p><div class="choices">${interests.map((x, i) => `<button class="choice ${chosen.includes(x) ? "selected" : ""}" data-interest="${i}" aria-pressed="${chosen.includes(x)}">${chosen.includes(x) ? "☑" : "□"} ${x}</button>`).join("")}</div><p id="count">${chosen.length} selected · ${Math.max(0, 3 - chosen.length)} more needed</p><button id="submitInterests" class="primary wide" ${chosen.length < 3 ? "disabled" : ""}>Find my events →</button><button data-tab="Profile" style="margin-top:12px">Back</button>`,
      2,
    );
  if (tab === "Home")
    html = `<div class="welcome topline"><div><div class="eyebrow">MAKE ROOM FOR WHAT’S NEXT</div><h1>Hey, ${esc(state.profile.name.split(" ")[0])}.</h1><p>Your next connection could be just around campus.</p></div><span class="tag">FALL 2026</span></div><div class="banner"><div><div class="eyebrow" style="color:#a6c6ff">A LITTLE EXPLORING GOES A LONG WAY</div><h2>Find something worth showing up for.</h2><p>Build your résumé. Meet your people. Try something new.</p></div><button data-tab="Calendar">Explore calendar ↗</button></div><div class="topline"><h2>On your radar <span class="subtle">${state.saved.length} saved</span></h2><button data-tab="Calendar">View calendar</button></div>${cards(state.events.filter((e) => state.saved.includes(e.id)))}<h2>Picked for your interests</h2>${cards(state.events.filter((e) => state.interests.includes(e.genre)))}<p class="subtle">All events, organizations’ event details, and attendee examples are fictional sample data.</p>`;
  if (tab === "Calendar") {
    let filtered = state.events.filter(
      (e) =>
        (!filters.genre || e.genre === filters.genre) &&
        (!filters.type || e.type === filters.type) &&
        (!filters.location || e.location === filters.location) &&
        (!filters.org || e.org === filters.org) &&
        (!filters.time ||
          (filters.time === "Before 5 PM"
            ? e.time < "17:00"
            : e.time >= "17:00")),
    );
    let days = new Date(year, month + 1, 0).getDate(),
      offset = new Date(year, month, 1).getDay();
    html = `<div class="eyebrow">YOUR CAMPUS AT A GLANCE</div><h1>Make some plans.</h1><div class="filters">${[
      ["genre", interests, "All interests"],
      ["type", ["Professional", "Social"], "All event types"],
      [
        "location",
        [...new Set(state.events.map((e) => e.location))],
        "All locations",
      ],
      [
        "org",
        [...new Set(state.events.map((e) => e.org))],
        "All organizations",
      ],
      ["time", ["Before 5 PM", "5 PM or later"], "Any time"],
    ]
      .map(
        ([k, a, label]) =>
          `<select aria-label="${label}" data-filter="${k}"><option value="">${label}</option>${options(a, filters[k])}</select>`,
      )
      .join(
        "",
      )}<button id="clearFilters">Reset filters</button></div><div class="panel"><div class="topline"><h2>${new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2><div><button id="prev" aria-label="Previous month">‹</button> <button id="next" aria-label="Next month">›</button></div></div><div class="calendar">${["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => `<div class="day head">${d}</div>`).join("")}${'<div class="day"></div>'.repeat(offset)}${Array.from(
      { length: days },
      (_, i) =>
        `<div class="day ${year === 2026 && month === 8 && i === 27 ? "today" : ""}">${i + 1}${filtered
          .filter(
            (e) =>
              e.date ===
              `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
          )
          .map(
            (e) =>
              `<button class="calEvent" data-event="${e.id}">${esc(e.name)}</button>`,
          )
          .join("")}</div>`,
    ).join(
      "",
    )}</div></div>${filtered.some((e) => e.date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`)) ? "" : '<div class="empty">No events found for this month and these filters.</div>'}`;
  }
  if (tab === "Search")
    html = `<div class="eyebrow">FIND YOUR NEXT THING</div><h1>What are you looking for?</h1><input class="searchBox" id="search" aria-label="Search events" placeholder="Search events, interests, or organizations…" value="${esc(query)}"><div id="results">${searchResults()}</div>`;
  if (tab === "Feed")
    html = `<div class="eyebrow">RECOMMENDED FEED</div><h1>A feed that gets you.</h1><div class="panel empty"><span class="tag">WIP</span><h2 style="margin-top:20px">Good things are on the way.</h2><p>Your personalized event feed is a work in progress.<br>Explore events picked for your interests on Home.</p><button class="primary" data-tab="Home">Back to Home</button></div>`;
  if (tab === "Settings")
    html = `<div class="settings"><div class="eyebrow">MAKE IT YOURS</div><h1>Settings</h1><div class="panel"><h2>${esc(state.profile.name)}</h2><p>${esc(state.profile.uni)} · ${esc(state.profile.level)}</p><p>${esc(state.profile.bio)}</p><button data-tab="Profile">Edit profile</button> <button data-tab="Interests">Edit interests</button></div><div class="panel"><h2>App preferences</h2><label class="setting">Open at launch<select id="launch">${options(["Home", "Calendar", "Search", "Feed", "Settings"], state.launch)}</select></label><p class="subtle">Preferences and saved events are stored on this device.</p></div><div class="panel"><h2>Club administration</h2><p>Try the event creation dashboard with sample data.</p><button data-tab="Admin">Open demo dashboard →</button></div><div class="panel"><h2>Account</h2><p>This prototype has no server authentication or email delivery.</p><button id="forgot">Forgot password</button></div></div>`;
  if (tab === "Admin")
    html = `<div class="topline"><h1>Club dashboard</h1><button data-tab="Settings">Back to settings</button></div><p>Demo administrator · Create your club with its first future event.</p><form id="eventForm" class="panel"><div class="row"><label>Hosting organization<input name="org" required></label><label>Event name<input name="name" required></label><label>Genre<select name="genre">${options(interests)}</select></label><label>Event type<select name="type">${options(["Professional", "Social"])}</select></label><label>Date<input name="date" type="date" required></label><label>Time<input name="time" type="time" required></label></div><label>Location<input name="location" required></label><label>Description<textarea name="desc" required></textarea></label><button class="primary">Create club & first event</button></form><h2>Your upcoming events</h2>${
      state.events
        .filter((e) => e.custom)
        .map(
          (e) =>
            `<div class="panel topline"><div><h3>${esc(e.name)}</h3><p>${esc(e.org)} · ${date(e)}</p></div><button data-delete="${e.id}">Cancel event</button></div>`,
        )
        .join("") || "<p>No events created yet.</p>"
    }`;
  $("#app").innerHTML = html;
  bind();
}
function searchResults() {
  return cards(
    state.events.filter((e) =>
      `${e.name} ${e.genre} ${e.org}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
  );
}
function bind() {
  document.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        tab = b.dataset.tab;
        render();
        window.scrollTo(0, 0);
      }),
  );
  document
    .querySelectorAll("[data-event]")
    .forEach((b) => (b.onclick = () => openEvent(Number(b.dataset.event))));
  document.querySelectorAll("[data-interest]").forEach(
    (b) =>
      (b.onclick = () => {
        let x = interests[b.dataset.interest];
        chosen = chosen.includes(x)
          ? chosen.filter((i) => i !== x)
          : [...chosen, x];
        render();
      }),
  );
  $("#submitInterests")?.addEventListener("click", () => {
    if (chosen.length < 3) return;
    state.interests = chosen;
    persist();
    tab = "Home";
    render();
  });
  $("#profileForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (!data.name.trim()) return;
    state.profile = {
      ...data,
      photo: window.photoData || state.profile?.photo,
    };
    persist();
    tab = "Interests";
    render();
  });
  $("#photo")?.addEventListener("change", (e) => {
    let f = e.target.files[0];
    if (!f) return;
    if (f.size > 2e6) {
      toast("Choose a photo smaller than 2 MB.");
      return;
    }
    let r = new FileReader();
    r.onload = () => {
      window.photoData = r.result;
      $("#avatarPreview").src = r.result;
      $("#avatarPreview").hidden = false;
      $("#avatarPlaceholder").style.display = "none";
    };
    r.readAsDataURL(f);
  });
  if (tab === "Profile" && state.profile?.photo) {
    $("#avatarPreview").src = state.profile.photo;
    $("#avatarPreview").hidden = false;
    $("#avatarPlaceholder").style.display = "none";
  }
  document.querySelectorAll("[data-filter]").forEach(
    (s) =>
      (s.onchange = () => {
        filters[s.dataset.filter] = s.value;
        render();
      }),
  );
  $("#clearFilters")?.addEventListener("click", () => {
    filters = {};
    render();
  });
  ["prev", "next"].forEach((id) =>
    $("#" + id)?.addEventListener("click", () => {
      month += id === "next" ? 1 : -1;
      if (month < 0) {
        month = 11;
        year--;
      }
      if (month > 11) {
        month = 0;
        year++;
      }
      render();
    }),
  );
  $("#search")?.addEventListener("input", (e) => {
    query = e.target.value;
    $("#results").innerHTML = searchResults();
    document
      .querySelectorAll("[data-event]")
      .forEach((b) => (b.onclick = () => openEvent(Number(b.dataset.event))));
  });
  $("#launch")?.addEventListener("change", (e) => {
    state.launch = e.target.value;
    persist();
    toast("Launch preference saved");
  });
  $("#forgot")?.addEventListener("click", () => {
    const d = $("#detail");
    d.innerHTML =
      '<button class="close" onclick="this.closest(\'dialog\').close()">Close</button><h2>Password recovery</h2><p>In the full app, a verification code will be sent to your registered email address or phone number. This demo does not send codes.</p>';
    d.showModal();
  });
  $("#eventForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (Object.values(data).some((v) => !v.trim()))
      return toast("Complete every required field.");
    if (new Date(data.date + "T" + data.time) <= new Date())
      return toast("Choose a future date and time.");
    state.events.push({ ...data, id: Date.now(), custom: true });
    persist();
    render();
    toast("Club and first event created");
  });
  document.querySelectorAll("[data-delete]").forEach(
    (b) =>
      (b.onclick = () => {
        state.events = state.events.filter(
          (e) => e.id !== Number(b.dataset.delete),
        );
        state.saved = state.saved.filter(
          (id) => id !== Number(b.dataset.delete),
        );
        persist();
        render();
        toast(
          "Event cancelled. Email notifications are not sent in this demo.",
        );
      }),
  );
}
function openEvent(id) {
  let e = state.events.find((x) => x.id === id);
  if (!e) return;
  const d = $("#detail"),
    saved = state.saved.includes(id);
  d.innerHTML = `<button class="close" id="closeDetail" aria-label="Close event details">✕</button><span class="tag">${esc(e.genre)}</span><h1 style="font-size:30px;margin-top:22px">${esc(e.name)}</h1><p>${date(e)}, ${time(e)}<br>${esc(e.location)}<br>Hosted by ${esc(e.org)}</p><p>${esc(e.desc)}</p>${saved ? '<div class="friends"><b>AM</b><b>JL</b><span>Alex & Jamie are going<br><small>Sample friends · demo only</small></span></div>' : ""}<div class="actions"><button class="primary" id="saveEvent">${saved ? "♥ Saved · remove from upcoming" : "♡ Like & add to upcoming"}</button><button id="google">Add a reminder · Google Calendar ↗</button><button id="apple">Add to Apple Calendar (.ics)</button><button id="share">Share event</button></div>`;
  if (!d.open) d.showModal();
  $("#closeDetail").onclick = () => d.close();
  $("#saveEvent").onclick = () => {
    state.saved = saved
      ? state.saved.filter((x) => x !== id)
      : [...state.saved, id];
    persist();
    render();
    openEvent(id);
  };
  const start = new Date(e.date + "T" + e.time),
    end = new Date(start.getTime() + 3600000),
    stamp = (d) =>
      d
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
  $("#google").onclick = () => {
    const p = new URLSearchParams({
      action: "TEMPLATE",
      text: e.name,
      dates: stamp(start) + "/" + stamp(end),
      details: e.desc,
      location: e.location,
    });
    window.open(
      "https://calendar.google.com/calendar/render?" + p,
      "_blank",
      "noopener,noreferrer",
    );
  };
  $("#apple").onclick = () => {
    const ie = (s) =>
      s
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Cougar Connect//Prototype//EN",
      "BEGIN:VEVENT",
      `UID:${e.id}@cougar-connect.demo`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${ie(e.name)}`,
      `LOCATION:${ie(e.location)}`,
      `DESCRIPTION:${ie(e.desc)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    a.download = "event.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $("#share").onclick = async () => {
    let text = `${e.name} — ${date(e)} at ${time(e)}, ${e.location}. (Sample BYU event)`;
    try {
      if (navigator.share) await navigator.share({ title: e.name, text });
      else {
        await navigator.clipboard.writeText(text);
        toast("Event details copied");
      }
    } catch (err) {
      if (err.name !== "AbortError")
        toast("Sharing unavailable in this browser.");
    }
  };
}
$("#profileBadge").onclick = () => {
  if (state.profile && state.interests.length >= 3) {
    tab = "Settings";
    render();
  }
};
$(".brand").onclick = (e) => {
  e.preventDefault();
  if (state.profile && state.interests.length >= 3) {
    tab = "Home";
    render();
  }
};
render();
if (document.modelContext?.registerTool) {
  try {
    Promise.resolve(
      document.modelContext.registerTool({
        name: "search_sample_events",
        description: "Read fictional BYU events matching a text query.",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute(input) {
          if (!input || typeof input.query !== "string")
            throw new Error("query must be a string");
          return state.events
            .filter((e) =>
              `${e.name} ${e.genre} ${e.org}`
                .toLowerCase()
                .includes(input.query.toLowerCase()),
            )
            .map(({ id, name, date, location }) => ({
              id,
              name,
              date,
              location,
            }));
        },
      }),
    ).catch(() => {});
  } catch {}
}
