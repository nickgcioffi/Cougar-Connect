import { runAction } from "./api.js";
import { $, escapeHtml, eventDate, eventTime, showToast } from "./ui.js";

export function eventCard(event, saved) {
  return `<button class="card" data-event-id="${event.id}"><div class="cardTop"><span class="date">${eventDate(event).split(" ")[0].toUpperCase()}<strong>${Number(event.date.slice(-2))}</strong></span><span class="eventIcon">↗</span></div><div class="cardBody"><span class="tag">${escapeHtml(event.genre)}</span><h3>${escapeHtml(event.name)}</h3><p>${eventTime(event)} · ${escapeHtml(event.location)}</p><div class="cardFoot">${escapeHtml(event.org)} <span style="float:right">${saved ? "♥ Saved" : "♡"}</span></div></div></button>`;
}

export function eventCards(events, savedIds) {
  return events.length
    ? `<div class="cards">${events.map((event) => eventCard(event, savedIds.includes(event.id))).join("")}</div>`
    : '<div class="panel empty">No events found.</div>';
}

export function bindEventCards(account, onChange) {
  document.querySelectorAll("[data-event-id]").forEach((button) => {
    button.onclick = () =>
      openEvent(account, Number(button.dataset.eventId), onChange);
  });
}

export function openEvent(account, id, onChange) {
  const event = account.events.find((item) => item.id === id);
  if (!event) return;
  const saved = account.saved.includes(id);
  const dialog = $("#detail");
  dialog.innerHTML = `<button class="close" id="closeDetail" aria-label="Close event details">✕</button><span class="tag">${escapeHtml(event.genre)}</span><h1 style="font-size:30px;margin-top:22px">${escapeHtml(event.name)}</h1><p>${eventDate(event)}, ${eventTime(event)}<br>${escapeHtml(event.location)}<br>Hosted by ${escapeHtml(event.org)}</p><p>${escapeHtml(event.desc)}</p><div class="actions"><button class="primary" id="saveEvent">${saved ? "♥ Saved · remove from upcoming" : "♡ Like & add to upcoming"}</button><button id="googleCalendar">Add to Google Calendar ↗</button><button id="shareEvent">Share event</button></div>`;
  dialog.showModal();
  $("#closeDetail").onclick = () => dialog.close();
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
    const start = new Date(`${event.date}T${event.time}`);
    const end = new Date(start.getTime() + 3600000);
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
