import {
  eventTimestamp,
  eventEndTimestamp,
  hasEventEnded,
} from "./event-time.js";
import { apiRequest, runAction } from "./api.js";
import { $, escapeHtml, eventDate, eventTime, showToast } from "./ui.js";

export function eventCard(event, saved) {
  return `<button class="card${hasEventEnded(event) ? " event-ended" : ""}" data-event-id="${event.id}"><div class="cardTop"><span class="date">${eventDate(event).split(" ")[0].toUpperCase()}<strong>${Number(event.date.slice(-2))}</strong></span><span class="eventIcon">↗</span></div><div class="cardBody"><span class="tag">${escapeHtml(event.external ? "External · BYU Clubs" : event.genre)}</span>${hasEventEnded(event) ? '<span class="ended-label">Ended</span>' : ""}<h3>${escapeHtml(event.name)}</h3><p>${eventTime(event)} · ${escapeHtml(event.location)}</p><div class="cardFoot">${escapeHtml(event.org)} <span style="float:right">${saved ? "♥ Saved" : "♡"}</span></div></div></button>`;
}

export function eventCards(events, savedIds) {
  return events.length
    ? `<div class="cards">${events
        .map((event) => {
          const saved = savedIds.includes(event.id);
          const card = eventCard(event, saved);
          if (!document.body.hasAttribute("data-mobile") || event.external)
            return card;
          return `<article class="mobile-event-card">${card}<button class="mobile-save" data-save-id="${event.id}" aria-pressed="${saved}">${saved ? "♥ Saved" : "♡ Save event"}<span class="sr-only">: ${escapeHtml(event.name)}</span></button></article>`;
        })
        .join("")}</div>`
    : '<div class="panel empty">No events found.</div>';
}

export function bindEventCards(account, onChange) {
  document.querySelectorAll("[data-save-id]").forEach((button) => {
    button.onclick = async () => {
      button.disabled = true;
      try {
        const id = Number(button.dataset.saveId);
        await runAction("save", { id, saved: !account.saved.includes(id) });
        await onChange();
      } catch (error) {
        showToast(error.message);
      } finally {
        button.disabled = false;
      }
    };
  });
  document.querySelectorAll("[data-event-id]").forEach((button) => {
    button.onclick = () =>
      openEvent(account, Number(button.dataset.eventId), onChange);
  });
}

export function openEvent(account, id, onChange) {
  const event = account.events.find((item) => item.id === id);
  if (!event) return;
  const saved = account.saved.includes(id);
  const ended = hasEventEnded(event);
  const dialog = $("#detail");
  const endTime = event.endTime
    ? eventTime({ date: event.date, time: event.endTime })
    : "";
  dialog.innerHTML = `<button class="close" id="closeDetail" aria-label="Close event details">✕</button><span class="tag">${escapeHtml(event.external ? "External · BYU Clubs" : event.genre)}</span>${ended ? '<p class="ended-label">Past event</p>' : ""}<h1 style="font-size:30px;margin-top:22px">${escapeHtml(event.name)}</h1><p>${eventDate(event)}, ${eventTime(event)}${endTime ? `–${endTime}` : ""}<br>${escapeHtml(event.location)}<br>Hosted by ${escapeHtml(event.org)}</p><p>${escapeHtml(event.desc)}</p>${event.external ? `<p><a href="${escapeHtml(event.sourceUrl)}" target="_blank" rel="noopener noreferrer">View on BYU Clubs ↗</a></p>` : ""}<div class="actions">${event.external ? "" : `<button class="primary" id="saveEvent">${saved ? "♥ Saved · remove from upcoming" : "♡ Like & add to upcoming"}</button>`}<button id="googleCalendar">Add to Google Calendar ↗</button><button id="shareEvent">Share event</button></div>`;
  // Show feedback form for past, non-external events.
  const canReview =
    !event.external && Boolean(event.endTime) && ended;
  if (canReview) {
    dialog.insertAdjacentHTML(
      "beforeend",
      `
      <section class="panel" style="margin-top:24px">
        <h3>Rate this event</h3>
        <p>Share your experience with the club organizers.</p>

        <form id="eventReviewForm">
          <label for="reviewRating">Your rating</label>
          <select id="reviewRating" name="rating" required>
            <option value="">Choose a rating</option>
            <option value="5">★★★★★ — Excellent</option>
            <option value="4">★★★★☆ — Good</option>
            <option value="3">★★★☆☆ — Average</option>
            <option value="2">★★☆☆☆ — Fair</option>
            <option value="1">★☆☆☆☆ — Poor</option>
          </select>

          <label for="reviewComment">Your feedback (optional)</label>
          <textarea
            id="reviewComment"
            name="comment"
            maxlength="1000"
            placeholder="What did you enjoy? What could be improved?"
          ></textarea>

          <button type="submit" class="primary">
            Submit feedback
          </button>
        </form>
      </section>
      `,
    );
  }

  const reviewForm = $("#eventReviewForm");

  if (reviewForm) {
    reviewForm.onsubmit = async (submitEvent) => {
      submitEvent.preventDefault();

      const submitButton = reviewForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;

      try {
        await apiRequest("reviews", {
          eventID: Number(event.id),
          rating: Number(reviewForm.elements.namedItem("rating").value),
          comment: reviewForm.elements.namedItem("comment").value,
        });

        dialog.close();
        showToast("Feedback submitted successfully");
      } catch (error) {
        showToast(error.message);
      } finally {
        submitButton.disabled = false;
      }
    };
  }

  dialog.showModal();
  $("#closeDetail").onclick = () => dialog.close();
  if (!event.external)
    $("#saveEvent").onclick = async () => {
      try {
        await runAction("save", { id, saved: !saved });
        dialog.close();
        await onChange();
      } catch (error) {
        showToast(error.message);
      }
    };
  $("#googleCalendar").onclick = () => {
    const start = eventTimestamp(event.date, event.time);
    const end = event.endTime
      ? eventEndTimestamp(event)
      : new Date(start.getTime() + 3600000);
    const stamp = (date) =>
      date
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: event.name,
      dates: `${stamp(start)}/${stamp(end)}`,
      details: event.desc,
      location: event.location,
    });
    window.open(
      `https://calendar.google.com/calendar/render?${params}`,
      "_blank",
      "noopener,noreferrer",
    );
  };
  $("#shareEvent").onclick = async () => {
    const text = `${event.name} — ${eventDate(event)} at ${eventTime(event)}, ${event.location}.`;
    try {
      if (navigator.share) await navigator.share({ title: event.name, text });
      else {
        await navigator.clipboard.writeText(text);
        showToast("Event details copied");
      }
    } catch (error) {
      if (error.name !== "AbortError") showToast("Sharing unavailable.");
    }
  };
}
