import { nextSetupPage, requireAccount } from "../shared/auth.js";
import { bindEventCards } from "../shared/events.js";
import { initializeSearch } from "../shared/search.js";
import {
  escapeHtml,
  eventTime,
  revealPage,
  setAccountBadge,
} from "../shared/ui.js";
import { campusDate, hasEventEnded } from "../shared/event-time.js";

const context = await requireAccount();
if (!context) throw new Error("Authentication required");
const { account } = context;
const setupPage = nextSetupPage(account);
if (setupPage) window.location.replace(setupPage);
setAccountBadge(account);
initializeSearch(account);

const today = campusDate();
let month = Number(today.slice(5, 7)) - 1;
let year = Number(today.slice(0, 4));
const filters = {};
const addOptions = (selector, values) =>
  values.forEach((value) =>
    document.querySelector(selector).add(new Option(value)),
  );
addOptions("#genreFilter", account.categories);
addOptions("#locationFilter", [
  ...new Set(account.events.map((event) => event.location)),
]);
addOptions("#organizationFilter", [
  ...new Set(account.events.map((event) => event.org)),
]);

function filteredEvents() {
  return account.events.filter(
    (event) =>
      (!filters.genre || event.genres.includes(filters.genre)) &&
      (!filters.type || event.type === filters.type) &&
      (!filters.location || event.location === filters.location) &&
      (!filters.organization || event.org === filters.organization) &&
      (!filters.time ||
        (filters.time === "Before 5 PM"
          ? event.time < "17:00"
          : event.time >= "17:00")),
  );
}

function renderCalendar() {
  const events = filteredEvents();
  document.querySelector("#monthTitle").textContent = new Date(
    year,
    month,
  ).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const selectedDate = document.querySelector("#agendaDate").value;
  const showMonth = document.querySelector("#showMonth");
  showMonth.disabled = !selectedDate;
  showMonth.textContent = selectedDate
    ? "Show whole month"
    : "Showing whole month";
  const visible = events
    .filter(
      (event) =>
        event.date.startsWith(prefix) &&
        (!selectedDate || event.date === selectedDate),
    )
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  let lastDate = "";
  document.querySelector("#calendarGrid").innerHTML = visible
    .map((event) => {
      const heading =
        lastDate !== event.date
          ? `<h3>${new Date(`${event.date}T12:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</h3>`
          : "";
      lastDate = event.date;
      return `${heading}<button class="agenda-event${hasEventEnded(event) ? " event-ended" : ""}" data-event-id="${event.id}">
      <span class="agenda-time">${eventTime(event)}</span>
      <span><strong>${escapeHtml(event.name)}</strong><small>${escapeHtml(event.location)} · ${escapeHtml(event.org)}</small>${event.external ? "<small>External · BYU Clubs</small>" : ""}</span>
      <span aria-hidden="true">›</span></button>`;
    })
    .join("");
  document.querySelector("#emptyCalendar").hidden = visible.length > 0;
  bindEventCards(account, async () => window.location.reload());
}

const filterElements = {
  genre: "#genreFilter",
  type: "#typeFilter",
  location: "#locationFilter",
  organization: "#organizationFilter",
  time: "#timeFilter",
};
for (const [name, selector] of Object.entries(filterElements))
  document.querySelector(selector).onchange = (event) => {
    filters[name] = event.target.value;
    renderCalendar();
  };
document.querySelector("#clearFilters").onclick = () => {
  for (const name of Object.keys(filters)) delete filters[name];
  for (const selector of Object.values(filterElements))
    document.querySelector(selector).value = "";
  renderCalendar();
};
document.querySelector("#previousMonth").onclick = () => {
  document.querySelector("#agendaDate").value = "";
  month--;
  if (month < 0) {
    month = 11;
    year--;
  }
  renderCalendar();
};
document.querySelector("#nextMonth").onclick = () => {
  document.querySelector("#agendaDate").value = "";
  month++;
  if (month > 11) {
    month = 0;
    year++;
  }
  renderCalendar();
};
document.querySelector("#agendaDate").onchange = (event) => {
  if (event.target.value) {
    const parts = event.target.value.split("-").map(Number);
    year = parts[0];
    month = parts[1] - 1;
  }
  renderCalendar();
};
document.querySelector("#showMonth").onclick = () => {
  document.querySelector("#agendaDate").value = "";
  renderCalendar();
};

document.querySelector("#monthTitle").insertAdjacentHTML(
  "afterend",
  '<p class="calendar-past-note">Past events appear in grey.</p>',
);
renderCalendar();
revealPage();

window.setInterval(renderCalendar, 60_000);
window.addEventListener("focus", renderCalendar);
