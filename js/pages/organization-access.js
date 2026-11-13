import { initializeSupabase, apiRequest } from "../shared/api.js";
import { rememberRequestReturn } from "../shared/return-path.js";
import { escapeHtml } from "../shared/ui.js";
const form = document.querySelector("#accessRequestForm");
form.addEventListener("submit", (event) => event.preventDefault());
const message = document.querySelector("#formMessage");
const button = document.querySelector("#submitRequest");
button.disabled = true;
try {
  const supabase = await initializeSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    rememberRequestReturn();
    location.replace("/login?next=/request-organization-access");
  } else {
    const account = await apiRequest("state");
    if (!account.profile) {
      rememberRequestReturn();
      location.replace("/profile");
    } else {
      sessionStorage.removeItem("cc_return_to");
      const names = account.profile.name.split(" ");
      form.elements.firstName.value = names.shift();
      form.elements.lastName.value = names.join(" ");
      form.elements.email.value = data.session.user.email || "";
      for (const field of ["firstName", "lastName", "email"]) {
        form.elements[field].readOnly = true;
        form.elements[field].required = false;
      }
      button.disabled = false;
      const history = document.querySelector("#requestHistory");
      const quota = document.querySelector("#requestQuota");
      let remaining = 3;
      let submitting = false;
      const updateQuota = () => {
        button.disabled = submitting || remaining === 0;
        quota.textContent =
          remaining === 0
            ? "Daily limit reached. You can submit again after midnight Mountain Time."
            : `${remaining} of 3 requests remaining today. Resets at midnight Mountain Time.`;
      };
      async function refresh() {
        const result = await apiRequest("organization-access-requests");
        remaining = result.remaining;
        updateQuota();
        const date = new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Denver",
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        history.innerHTML = `<h2>Your requests</h2>${result.requests.length ? result.requests.map((r) => `<article class="request-history-card"><div><h3>${escapeHtml(r.organization)}</h3>${r.createdAt ? `<p>${date.format(new Date(r.createdAt))}</p>` : ""}</div><span class="request-status">${escapeHtml(r.status)}</span></article>`).join("") : '<p class="request-history-empty">Your submitted requests and their status will appear here.</p>'}`;
      }
      await refresh();
      window.addEventListener("focus", () => refresh().catch(() => {}));
      form.onsubmit = async (event) => {
        event.preventDefault();
        if (submitting || remaining === 0) return;
        submitting = true;
        button.disabled = true;
        button.textContent = "Submitting…";
        message.textContent = "";
        try {
          const result = await apiRequest(
            "organization-access-request",
            Object.fromEntries(new FormData(form)),
          );
          const messages = {
            Pending: "Your request was saved and is awaiting review.",
            "Needs Review":
              "Your request was submitted and is pending human review.",
            Rejected: "Your request was reviewed and rejected.",
          };
          message.textContent =
            (messages[result.status] || "Request submitted.") +
            (result.notificationSent ? " A notification email was sent." : "");
          for (const field of ["organization", "position", "reason"])
            form.elements[field].value = "";
          remaining = Math.max(0, remaining - 1);
          try {
            await refresh();
          } catch {
            message.textContent += " Refresh to update your request history.";
          }
        } catch (error) {
          message.textContent = error.message;
          if (error.status === 429) {
            remaining = 0;
          }
        } finally {
          submitting = false;
          updateQuota();
          button.textContent = "Submit Request";
        }
      };
    }
  }
} catch (error) {
  button.disabled = true;
  message.textContent = error.message;
}
