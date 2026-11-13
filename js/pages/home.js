import { nextSetupPage, requireAccount } from "../shared/auth.js";
import { bindEventCards, eventCards } from "../shared/events.js";
import { initializeSearch } from "../shared/search.js";
import { revealPage, setAccountBadge } from "../shared/ui.js";
import {
  hasEventEnded,
  compareEventStarts,
} from "../shared/event-time.js";

let account;

async function loadHome() {
  const context = await requireAccount();
  if (!context) return;

  account = context.account;

  const setupPage = nextSetupPage(account);
  if (setupPage) return window.location.replace(setupPage);

  setAccountBadge(account);

  document.querySelector("#firstName").textContent =
    account.profile.name.split(" ")[0];

  renderHome();
  initializeSearch(account, loadHome);
  revealPage();
}

function renderHome() {
  if (!account) return;

  const now = new Date();

  const saved = account.events.filter((event) =>
    account.saved.includes(event.id),
  );

  const upcoming = saved
    .filter((event) => !hasEventEnded(event, now))
    .sort(compareEventStarts);

  const past = saved
    .filter((event) => hasEventEnded(event, now))
    .sort((a, b) => compareEventStarts(b, a));

  document.querySelector("#savedCount").textContent =
    `${upcoming.length} upcoming · ${past.length} past`;

  const pastWasOpen =
    document.querySelector(".past-saved-events")?.open || false;

  document.querySelector("#savedEvents").innerHTML = `
    <h3>Upcoming saved events</h3>
    ${
      upcoming.length
        ? eventCards(upcoming, account.saved)
        : '<div class="panel empty">No upcoming saved events. Explore the calendar to find one.</div>'
    }

    <details class="past-saved-events" ${pastWasOpen ? "open" : ""}>
      <summary>Past saved events (${past.length})</summary>
      ${
        past.length
          ? eventCards(past, account.saved)
          : '<div class="panel empty">No past saved events.</div>'
      }
    </details>
  `;

  const recommended = account.events
    .filter(
      (event) =>
        !hasEventEnded(event, now) &&
        event.genres.some((genre) =>
          account.interests.includes(genre),
        ),
    )
    .sort(compareEventStarts);

  document.querySelector("#recommendedEvents").innerHTML =
    recommended.length
      ? eventCards(recommended, account.saved)
      : '<div class="panel empty">No upcoming events match your interests right now. Explore the calendar for more events.</div>';

  bindEventCards(account, loadHome);
}

await loadHome();

// Update when time passes or the user returns to the page.
window.setInterval(renderHome, 60_000);
window.addEventListener("focus", renderHome);