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
let editingEventId = null;

function resetEventForm() {
  const form = document.querySelector("#eventForm");

  editingEventId = null;
  form.reset();
  form.elements.namedItem("orgID").disabled = false;
  form.querySelector('button[type="submit"]').textContent = "Create event";
  document.querySelector("#cancelEditing").hidden = true;
}

function renderAdmin() {
  const organization = document.querySelector("#organization");
  organization.innerHTML = account.admins
    .map(
      (item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`,
    )
    .join("");
  document.querySelector("#genre").innerHTML = account.categories
    .map((item) => `<option>${escapeHtml(item)}</option>`)
    .join("");
  document.querySelector("#noOrganizations").hidden = account.admins.length > 0;

  document.querySelector("#eventForm").hidden = account.admins.length === 0;
  const adminOrgIDs = new Set(account.admins.map((admin) => String(admin.id)));

  const managedEvents = account.events.filter(
    (event) => event.orgID != null && adminOrgIDs.has(String(event.orgID)),
  );
  document.querySelector("#adminEvents").innerHTML = managedEvents.length
    ? managedEvents
        .map(
          (event) => `
    <div class="panel topline">
      <div>
        <h3>${escapeHtml(event.name)}</h3>
        <p>${escapeHtml(event.org)} · ${eventDate(event)}</p>
      </div>
      <div class="row">
        <button type="button" data-edit-event="${event.id}">
          Edit event
        </button>
        <button type="button" data-delete-event="${event.id}">
          Delete event
        </button>
      </div>
    </div>
  `,
        )
        .join("")
    : "<p>No events found.</p>";

  document.querySelectorAll("[data-edit-event]").forEach((button) => {
    button.onclick = () => {
      const selectedEvent = managedEvents.find(
        (event) => String(event.id) === button.dataset.editEvent,
      );

      if (!selectedEvent) return;

      editingEventId = selectedEvent.id;

      document.querySelector("#cancelEditing").hidden = false;

      const form = document.querySelector("#eventForm");

      form.elements.namedItem("orgID").value = selectedEvent.orgID;
      form.elements.namedItem("name").value = selectedEvent.name;
      form.elements.namedItem("genre").value = selectedEvent.genre;
      form.elements.namedItem("type").value = selectedEvent.type;
      form.elements.namedItem("date").value = selectedEvent.date;
      form.elements.namedItem("time").value =
        selectedEvent.time?.slice(0, 5) || "";
      form.elements.namedItem("location").value = selectedEvent.location;
      form.elements.namedItem("desc").value = selectedEvent.desc || "";

      form.elements.namedItem("orgID").disabled = true;

      form.querySelector('button[type="submit"]').textContent = "Save changes";

      form.scrollIntoView({ behavior: "smooth" });
    };
  });
  document.querySelectorAll("[data-delete-event]").forEach((button) => {
    button.onclick = async () => {
      const selectedEvent = managedEvents.find(
        (event) => String(event.id) === button.dataset.deleteEvent,
      );

      if (!selectedEvent) return;

      if (
        !window.confirm(
          `Are you sure you want to delete "${selectedEvent.name}"?\n\nThis event will be removed for everyone.`,
        )
      )
        return;
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

  const form = event.target;
  const payload = Object.fromEntries(new FormData(form));
  const isEditing = editingEventId !== null;

  try {
    if (isEditing) {
      payload.id = editingEventId;
      await runAction("update", payload);
    } else {
      await runAction("event", payload);
    }

    resetEventForm();

    account = await loadAccount();
    renderAdmin();

    showToast(isEditing ? "Event updated successfully" : "Event created");
  } catch (error) {
    showToast(error.message);
  }
};

renderAdmin();
revealPage();

document.querySelector("#cancelEditing").onclick = resetEventForm;
