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
  let popup = document.querySelector("#messagePopup");

  if (!popup) {
    popup = document.createElement("dialog");
    popup.id = "messagePopup";
    popup.setAttribute("aria-label", "Account message");
    popup.setAttribute("aria-describedby", "messagePopupText");

    popup.innerHTML = `
      <p id="messagePopupText"></p>
      <button type="button" class="primary wide">Got it</button>
    `;

    popup.querySelector("button").addEventListener("click", () => {
      popup.close();
    });

    document.body.appendChild(popup);
  }

  popup.querySelector("#messagePopupText").textContent = message;

  if (!popup.open) popup.showModal();
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
  badge.setAttribute("aria-label", "Profile settings");

  if (!account.profile.photo) return;

  const photo = document.createElement("img");
  photo.alt = "";
  photo.addEventListener("load", () => badge.replaceChildren(photo), {
    once: true,
  });
  photo.src = account.profile.photo;
}

export function setLoading(isLoading) {
  document.querySelectorAll("button").forEach((button) => {
    button.disabled = isLoading;
  });
}
