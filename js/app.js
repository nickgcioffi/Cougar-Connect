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
let state = { profile: null, interests: [], saved: [], launch: "Home", events: [], admins: [] };
let tab = "Auth", chosen = [], month = new Date().getMonth(), year = new Date().getFullYear(), filters = {}, query = "";
let supabase, session, recovery = false, busy = false;
async function api(path, body) {
  const { data } = await supabase.auth.getSession();
  const response = await fetch('/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
}
async function loadState() {
  state = await api('state');
  interests.splice(0, interests.length, ...state.categories);
  chosen = [...state.interests];
}
async function mutate(action, payload, after) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button').forEach(b => b.disabled = true);
  try { await api('action', { action, payload }); await loadState(); if (after) after(); render(); }
  catch (error) { render(); toast(error.message); }
  finally { busy = false; }
}
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
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
  $("#nav").innerHTML = ["Profile", "Interests", "Auth", "Loading", "Error"].includes(tab)
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
  if (tab === "Auth") html = setup(`<h2>${recovery ? 'Choose a new password' : 'Welcome to Cougar Connect'}</h2><form id="authForm">${recovery ? '' : '<label>Email<input name="email" type="email" autocomplete="email" required></label>'}<label>Password<input name="password" type="password" autocomplete="${recovery ? 'new-password' : 'current-password'}" minlength="8" required></label><button class="primary wide" name="action" value="login">${recovery ? 'Update password' : 'Sign in'}</button>${recovery ? '' : '<button class="wide" name="action" value="signup">Create account</button>'}</form>${recovery ? '' : '<button id="resetPassword">Forgot password</button>'}`, 1);
  if (tab === "Loading") html = '<div class="panel empty">Loading your account…</div>';
  if (tab === "Error") html = '<div class="panel empty"><h2>Unable to load your account</h2><p>Check your connection and make sure the database migration has been applied.</p><button id="retry">Try again</button><button id="signout">Sign out</button></div>';
  if (tab === "Profile")
    html = setup(
      `<div class="eyebrow">STEP 01 / 02</div><h2 style="margin-top:8px">Make yourself at home.</h2><p>Start with a little about you.</p><form id="profileForm"><div class="upload"><img class="avatar" id="avatarPreview" alt="Profile photo" hidden><span class="avatar" id="avatarPlaceholder">＋</span><label>Profile photo <span class="subtle">(optional)</span><input id="photo" type="file" accept="image/*"></label></div><label>Full name<input name="name" placeholder="e.g. Jordan Miller" required maxlength="80" value="${esc(state.profile?.name || "")}"></label><label>University<select name="uni">${options(["Brigham Young University", "BYU–Idaho", "BYU–Hawaii", "Other"], state.profile?.uni)}</select></label><div class="row"><label>Study level<select name="level">${options(["Undergraduate", "Graduate"], state.profile?.level)}</select></label><label>Graduation date<input name="graduation" type="month" required value="${esc(state.profile?.graduation || "2027-04")}"></label></div><label>Primary interest<select name="interest">${options(interests, state.profile?.interest)}</select></label><label>Bio <span class="subtle">(optional)</span><textarea name="bio" placeholder="What are you hoping to get involved in?" maxlength="400">${esc(state.profile?.bio || "")}</textarea></label><button class="primary wide">Create profile →</button><p class="subtle" style="margin:12px 0 0">Your profile is saved to your account.</p></form>`,
      1,
    );
  if (tab === "Interests")
    html = setup(
      `<div class="eyebrow">STEP 02 / 02</div><h2 style="margin-top:8px">What draws you in?</h2><p>Pick at least three interests. We’ll help you find your kind of campus events.</p><div class="choices">${interests.map((x, i) => `<button class="choice ${chosen.includes(x) ? "selected" : ""}" data-interest="${i}" aria-pressed="${chosen.includes(x)}">${chosen.includes(x) ? "☑" : "□"} ${x}</button>`).join("")}</div><p id="count">${chosen.length} selected · ${Math.max(0, 3 - chosen.length)} more needed</p><button id="submitInterests" class="primary wide" ${chosen.length < 3 ? "disabled" : ""}>Find my events →</button><button data-tab="Profile" style="margin-top:12px">Back</button>`,
      2,
    );
  if (tab === "Home")
    html = `<div class="welcome topline"><div><div class="eyebrow">MAKE ROOM FOR WHAT’S NEXT</div><h1>Hey, ${esc(state.profile.name.split(" ")[0])}.</h1><p>Your next connection could be just around campus.</p></div><span class="tag">${new Date().getFullYear()}</span></div><div class="banner"><div><div class="eyebrow" style="color:#a6c6ff">A LITTLE EXPLORING GOES A LONG WAY</div><h2>Find something worth showing up for.</h2><p>Build your résumé. Meet your people. Try something new.</p></div><button data-tab="Calendar">Explore calendar ↗</button></div><div class="topline"><h2>On your radar <span class="subtle">${state.saved.length} saved</span></h2><button data-tab="Calendar">View calendar</button></div>${cards(state.events.filter((e) => state.saved.includes(e.id)))}<h2>Picked for your interests</h2>${cards(state.events.filter((e) => e.genres.some(g => state.interests.includes(g))))}`;
  if (tab === "Calendar") {
    let filtered = state.events.filter(
      (e) =>
        (!filters.genre || e.genres.includes(filters.genre)) &&
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
        `<div class="day ${year === new Date().getFullYear() && month === new Date().getMonth() && i + 1 === new Date().getDate() ? "today" : ""}">${i + 1}${filtered
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
    html = `<div class="settings"><div class="eyebrow">MAKE IT YOURS</div><h1>Settings</h1><div class="panel"><h2>${esc(state.profile.name)}</h2><p>${esc(state.profile.uni)} · ${esc(state.profile.level)}</p><p>${esc(state.profile.bio)}</p><button data-tab="Profile">Edit profile</button> <button data-tab="Interests">Edit interests</button></div><div class="panel"><h2>App preferences</h2><label class="setting">Open at launch<select id="launch">${options(["Home", "Calendar", "Search", "Feed", "Settings"], state.launch)}</select></label><p class="subtle">Preferences and saved events are saved to your account.</p></div>${state.admins.length ? '<div class="panel"><h2>Club administration</h2><p>Manage events for your organizations.</p><button data-tab="Admin">Open dashboard →</button></div>' : ""}<div class="panel"><h2>Account</h2><p>Signed in with Supabase Auth.</p><button id="forgot">Reset password</button> <button id="signout">Sign out</button></div></div>`;
  if (tab === "Admin" && state.admins.length)
    html = `<div class="topline"><h1>Club dashboard</h1><button data-tab="Settings">Back to settings</button></div><p>Create an event for an organization you administer.</p><form id="eventForm" class="panel"><div class="row"><label>Hosting organization<select name="orgID" required>${state.admins.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join("")}</select></label><label>Event name<input name="name" required></label><label>Genre<select name="genre">${options(interests)}</select></label><label>Event type<select name="type">${options(["Professional", "Social"])}</select></label><label>Date<input name="date" type="date" required></label><label>Time<input name="time" type="time" required></label></div><label>Location<input name="location" required></label><label>Description<textarea name="desc" required></textarea></label><button class="primary">Create event</button></form><h2>Your organizations’ events</h2>${
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
      `${e.name} ${e.genres.join(" ")} ${e.org}`
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
    mutate('interests', chosen, () => { tab = 'Home'; });
  });
  $("#profileForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(new FormData(e.target));
    try {
      const file = $("#photo").files[0];
      data.photo = state.profile?.photo || null;
      if (file) {
        if (file.size > 2e6 || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP photo smaller than 2 MB.');
        const path = `${session.user.id}/avatar`;
        const { error } = await supabase.storage.from('profile-photos').upload(path, file, { upsert: true, contentType: file.type });
        if (error) throw error;
        data.photo = supabase.storage.from('profile-photos').getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
      }
      await mutate('profile', data, () => { tab = 'Interests'; });
    } catch(error) { toast(error.message); }
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
  $("#launch")?.addEventListener("change", e => mutate('launch', { launch:e.target.value }, () => toast('Launch preference saved')));
  $("#forgot")?.addEventListener("click", () => sendReset(session.user.email));
  $("#signout")?.addEventListener("click", async () => {
    const { error } = await supabase.auth.signOut();
    if (error) return toast(error.message);
    $("#detail").close();
    session = null; state = { profile:null, interests:[], saved:[], launch:'Home', events:[], admins:[] }; chosen=[]; tab='Auth'; render();
  });
  $("#retry")?.addEventListener("click", () => refreshAccount());
  $("#resetPassword")?.addEventListener("click", () => {
    const email = $("#authForm [name=email]").value;
    if (!email || !$("#authForm [name=email]").checkValidity()) return toast('Enter a valid email address first.');
    sendReset(email);
  });
  $("#authForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    const { email, password } = Object.fromEntries(new FormData(e.target));
    const button = e.submitter;
    document.querySelectorAll('#authForm button').forEach(b=>b.disabled=true);
    try {
      const result = recovery ? await supabase.auth.updateUser({password}) : button?.value === 'signup' ? await supabase.auth.signUp({email,password,options:{emailRedirectTo:location.origin}}) : await supabase.auth.signInWithPassword({email,password});
      if (result.error) throw result.error;
      if (recovery) { recovery=false; await refreshAccount(); toast('Password updated'); }
      else if (result.data.session) { session=result.data.session; await refreshAccount(); }
      else toast('Check your email to confirm your account, then sign in.');
    } catch(error) { toast(error.message); }
    finally { document.querySelectorAll('#authForm button').forEach(b=>b.disabled=false); }
  });
  $("#eventForm")?.addEventListener("submit", e => {
    e.preventDefault();
    mutate('event', Object.fromEntries(new FormData(e.target)), () => toast('Event created'));
  });
  document.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => {
    if (confirm('Cancel this event for everyone?')) mutate('delete', {id:b.dataset.delete}, () => toast('Event cancelled'));
  });

}
function openEvent(id) {
  let e = state.events.find((x) => x.id === id);
  if (!e) return;
  const d = $("#detail"),
    saved = state.saved.includes(id);
  d.innerHTML = `<button class="close" id="closeDetail" aria-label="Close event details">✕</button><span class="tag">${esc(e.genre)}</span><h1 style="font-size:30px;margin-top:22px">${esc(e.name)}</h1><p>${date(e)}, ${time(e)}<br>${esc(e.location)}<br>Hosted by ${esc(e.org)}</p><p>${esc(e.desc)}</p><div class="actions"><button class="primary" id="saveEvent">${saved ? "♥ Saved · remove from upcoming" : "♡ Like & add to upcoming"}</button><button id="google">Add a reminder · Google Calendar ↗</button><button id="apple">Add to Apple Calendar (.ics)</button><button id="share">Share event</button></div>`;
  if (!d.open) d.showModal();
  $("#closeDetail").onclick = () => d.close();
  $("#saveEvent").onclick = () => mutate('save', {id, saved:!saved}, () => openEvent(id));
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
      "PRODID:-//Cougar Connect//Events//EN",
      "BEGIN:VEVENT",
      `UID:${e.id}@cougar-connect`,
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
    let text = `${e.name} — ${date(e)} at ${time(e)}, ${e.location}.`;
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
async function sendReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
  toast(error ? error.message : 'Check your email for a password reset link.');
}
async function refreshAccount() {
  tab = 'Loading'; render();
  try {
    await loadState();
    tab = state.profile && state.interests.length >= 3 ? state.launch : state.profile ? 'Interests' : 'Profile';
    render();
  } catch(error) { tab='Error'; render(); toast(error.message); }
}
async function initialize() {
  tab='Loading'; render();
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error('Run the app using npm start.');
    const config = await response.json();
    supabase = window.createSupabaseClient(config.url,config.key);
    supabase.auth.onAuthStateChange((event, current) => {
      session=current;
      if (event === 'PASSWORD_RECOVERY') { recovery=true; tab='Auth'; render(); }
      if (event === 'SIGNED_OUT') { tab='Auth'; render(); }
    });
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    session=data.session;
    if (recovery) { tab='Auth'; render(); }
    else if (session) await refreshAccount();
    else { tab='Auth'; render(); }
  } catch(error) { tab='Error'; render(); toast(error.message); }
}
initialize();
