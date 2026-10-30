export const $ = (selector) => document.querySelector(selector);
const pageLoadStarted = performance.now();

export function revealPage(minimumDelay = 120) {
  const remainingDelay = Math.max(
    0,
    minimumDelay - (performance.now() - pageLoadStarted),
  );
  window.setTimeout(() => {
    document.body.classList.remove("page-loading");
    document.body.classList.add("page-ready");
  }, remainingDelay);
}

export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}

export function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.style.display = "block";
  window.setTimeout(() => {
    toast.style.display = "none";
  }, 3500);
}

export function eventDate(event) {
  return new Date(`${event.date}T12:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function eventTime(event) {
  return new Date(`${event.date}T${event.time}`).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function setAccountBadge(account) {
  const badge = $("#profileBadge");
  if (!badge || !account.profile) return;
  badge.textContent = account.profile.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

export function setLoading(isLoading) {
  document.querySelectorAll("button").forEach((button) => {
    button.disabled = isLoading;
  });
}
