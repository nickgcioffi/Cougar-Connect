import { nextSetupPage, requireAccount } from "../shared/auth.js";
import { bindEventCards } from "../shared/events.js";
import { initializeSearch } from "../shared/search.js";
import { escapeHtml, revealPage, setAccountBadge } from "../shared/ui.js";

const context = await requireAccount();
if (!context) throw new Error("Authentication required");
const { account } = context;
const setupPage = nextSetupPage(account);
if (setupPage) window.location.replace(setupPage);
setAccountBadge(account);
initializeSearch(account);

let month = new Date().getMonth();
let year = new Date().getFullYear();
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
  const headings = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
    .map((day) => `<div class="day head">${day}</div>`)
    .join("");
  const blanks = '<div class="day"></div>'.repeat(
    new Date(year, month, 1).getDay(),
  );
  const days = Array.from(
    { length: new Date(year, month + 1, 0).getDate() },
    (_, index) => {
      const day = index + 1;
      const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const buttons = events
        .filter((event) => event.date === date)
        .map(
          (event) =>
            `<button class="calEvent" data-event-id="${event.id}">${escapeHtml(event.name)}</button>`,
        )
        .join("");
      return `<div class="day">${day}${buttons}</div>`;
    },
  ).join("");
  document.querySelector("#calendarGrid").innerHTML = headings + blanks + days;
  document.querySelector("#emptyCalendar").hidden = events.some((event) =>
    event.date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`),
  );
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
  month--;
  if (month < 0) {
    month = 11;
    year--;
  }
  renderCalendar();
};
document.querySelector("#nextMonth").onclick = () => {
  month++;
  if (month > 11) {
    month = 0;
    year++;
  }
  renderCalendar();
};
renderCalendar();
revealPage();
