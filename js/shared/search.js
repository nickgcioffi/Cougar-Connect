import { openEvent } from "./events.js";
import { escapeHtml, eventDate, eventTime } from "./ui.js";

export function initializeSearch(
  account,
  onChange = async () => location.reload(),
) {
  const input = document.querySelector("#search");
  const results = document.querySelector("#globalSearchResults");
  if (!input || !results) return;

  input.addEventListener("input", () => {
    const searchTerm = input.value.trim().toLowerCase();
    if (!searchTerm) {
      results.hidden = true;
      results.innerHTML = "";
      return;
    }

    const matches = account.events
      .filter((event) =>
        `${event.name} ${event.genres.join(" ")} ${event.org} ${event.location}`
          .toLowerCase()
          .includes(searchTerm),
      )
      .slice(0, 8);

    results.innerHTML = matches.length
      ? matches
          .map(
            (event) => `
              <button class="searchResult" data-search-event="${event.id}">
                <strong>${escapeHtml(event.name)}</strong>
                <small>${escapeHtml(event.genre)} · ${escapeHtml(event.org)}</small>
                <small>${eventDate(event)} · ${eventTime(event)} · ${escapeHtml(event.location)}</small>
              </button>`,
          )
          .join("")
      : '<div class="searchNoResults">No matching events found.</div>';
    results.hidden = false;

    results.querySelectorAll("[data-search-event]").forEach((button) => {
      button.onclick = () => {
        results.hidden = true;
        input.value = "";
        openEvent(account, Number(button.dataset.searchEvent), onChange);
      };
    });
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      input.value = "";
      results.hidden = true;
      input.blur();
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#globalSearch")) results.hidden = true;
  });
}
