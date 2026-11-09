import { apiRequest } from "./api.js";
import { openEvent } from "./events.js";
import { escapeHtml, eventDate, eventTime } from "./ui.js";

export function initializeSearch(
  account,
  onChange = async () => location.reload(),
) {
  const input = document.querySelector("#search");
  const results = document.querySelector("#globalSearchResults");
  if (!input || !results) return;

  let timer;
  let controller;
  let version = 0;
  function cancelSearch() {
    clearTimeout(timer);
    controller?.abort();
    version += 1;
  }
  input.maxLength = 100;
  input.addEventListener("input", () => {
    cancelSearch();
    const currentVersion = version;
    const searchTerm = input.value.trim().toLowerCase();
    if (!searchTerm) {
      results.hidden = true;
      results.innerHTML = "";
      return;
    }

    results.hidden = false;
    results.textContent = "Searching...";
    timer = setTimeout(async () => {
      controller = new AbortController();
      try {
        const matches = await apiRequest(
          `events/search?q=${encodeURIComponent(searchTerm)}`,
          undefined,
          { signal: controller.signal },
        );
        if (currentVersion !== version) return;
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
            const id = Number(button.dataset.searchEvent);
            const selected = matches.find((event) => event.id === id);
            // Search can return events created since the page originally loaded.
            const detailsAccount = {
              ...account,
              events: [
                selected,
                ...account.events.filter((event) => event.id !== id),
              ],
            };
            openEvent(detailsAccount, id, onChange);
          };
        });
      } catch (error) {
        if (error.name === "AbortError" || currentVersion !== version) return;
        results.textContent = "Search couldn't load. Please try again.";
        results.hidden = false;
      }
    }, 250);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      cancelSearch();
      input.value = "";
      results.hidden = true;
      input.blur();
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#globalSearch")) {
      cancelSearch();
      results.hidden = true;
    }
  });
}
