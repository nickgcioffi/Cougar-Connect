import { requireAccount } from "../shared/auth.js";
import { apiRequest, loadAccount, runAction } from "../shared/api.js";
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
let eventSaveCounts = {};

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
      <p>♥ ${eventSaveCounts[event.id] ?? 0} students saved this event</p>
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
      form.elements.namedItem("endTime").value =
        selectedEvent.endTime?.slice(0, 5) || "";
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


async function loadAdminReviews() {
  const container = document.querySelector("#adminReviews");

  try {
    const { reviews } = await apiRequest("admin/reviews");

    if (!reviews.length) {
      container.innerHTML = "<p>No student feedback yet.</p>";
      return;
    }

    // Group reviews by event.
    const grouped = new Map();

    for (const review of reviews) {
      if (!grouped.has(review.eventID)) {
        grouped.set(review.eventID, {
          name: review.eventName || "Event",
          reviews: [],
        });
      }
      grouped.get(review.eventID).reviews.push(review);
    }

    container.innerHTML = [...grouped.values()]
      .map(({ name, reviews: eventReviews }) => {
        const average =
          eventReviews.reduce((sum, review) => sum + review.rating, 0) /
          eventReviews.length;

        const sorted = [...eventReviews].sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );

        return `
          <div class="panel" style="margin: 16px 0;">
            <h3>${escapeHtml(name)}</h3>
            <p>⭐ ${average.toFixed(1)}/5 · ${eventReviews.length} reviews</p>

            <details>
              <summary>View student feedback</summary>
              <div class="review-list">
                ${sorted
                  .map(
                    (review, index) => `
                      <div
                        class="review-item"
                        ${index >= 3 ? "hidden" : ""}
                        style="padding: 12px 0; border-bottom: 1px solid #ddd;"
                      >
                        <strong>⭐ ${review.rating}/5</strong>
                        <small>${new Date(review.created_at).toLocaleDateString()}</small>
                        <p>${escapeHtml(review.comment || "No written feedback.")}</p>
                      </div>
                    `
                  )
                  .join("")}
              </div>

              ${
                sorted.length > 3
                  ? '<button type="button" class="show-more-reviews">Show more reviews</button>'
                  : ""
              }
            </details>
          </div>
        `;
      })
      .join("");

    container.querySelectorAll(".show-more-reviews").forEach((button) => {
      button.onclick = () => {
        const list = button.closest("details").querySelector(".review-list");
        const hiddenReviews = [...list.querySelectorAll(".review-item[hidden]")];

        hiddenReviews.slice(0, 5).forEach((review) => {
          review.hidden = false;
        });

        if (!list.querySelector(".review-item[hidden]")) {
          button.remove();
        }
      };
    });
  } catch (error) {
    container.textContent = error.message;
  }
}

async function loadEventSaveCounts() {
  try {
    const { saves } = await apiRequest("admin/event-saves");

    eventSaveCounts = Object.fromEntries(
      saves.map((item) => [item.eventID, item.totalSaves])
    );

    renderAdmin();
  } catch (error) {
    showToast(error.message);
  }
}

loadAdminReviews();


loadEventSaveCounts();