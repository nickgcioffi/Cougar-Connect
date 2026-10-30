import { requireAccount } from "../shared/auth.js";
import { loadAccount, runAction } from "../shared/api.js";
import {
  escapeHtml,
  eventDate,
  revealPage,
  setAccountBadge,
  showToast,
} from "../shared/ui.js";

let context = await requireAccount();
if (!context) throw new Error("Authentication required");
let account = context.account;
setAccountBadge(account);

function renderAdmin() {
  const organization = document.querySelector("#organization");
  organization.innerHTML = account.organizations
    .map(
      (item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`,
    )
    .join("");
  document.querySelector("#genre").innerHTML = account.categories
    .map((item) => `<option>${escapeHtml(item)}</option>`)
    .join("");
  document.querySelector("#noOrganizations").hidden =
    account.organizations.length > 0;
  document.querySelector("#eventForm").hidden =
    account.organizations.length === 0;
  document.querySelector("#adminEvents").innerHTML = account.events.length
    ? account.events
        .map(
          (event) =>
            `<div class="panel topline"><div><h3>${escapeHtml(event.name)}</h3><p>${escapeHtml(event.org)} · ${eventDate(event)}</p></div><button data-delete-event="${event.id}">Cancel event</button></div>`,
        )
        .join("")
    : "<p>No events found.</p>";
  document.querySelectorAll("[data-delete-event]").forEach((button) => {
    button.onclick = async () => {
      if (!window.confirm("Cancel this event for everyone?")) return;
      try {
        await runAction("delete", { id: button.dataset.deleteEvent });
        account = await loadAccount();
        renderAdmin();
        showToast("Event cancelled");
      } catch (error) {
        showToast(error.message);
      }
    };
  });
}

document.querySelector("#eventForm").onsubmit = async (event) => {
  event.preventDefault();
  try {
    await runAction("event", Object.fromEntries(new FormData(event.target)));
    event.target.reset();
    account = await loadAccount();
    renderAdmin();
    showToast("Event created");
  } catch (error) {
    showToast(error.message);
  }
};
renderAdmin();
revealPage();
