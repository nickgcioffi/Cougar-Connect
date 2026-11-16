import { nextSetupPage, requireAccount } from "../shared/auth.js";
import { apiRequest, runAction } from "../shared/api.js";
import { revealPage, setAccountBadge, showToast } from "../shared/ui.js";
import { initializeSearch } from "../shared/search.js";
import { applyLogoDestination } from "../shared/logo-destination.js";

const context = await requireAccount();
if (!context) throw new Error("Authentication required");
const { account, session, supabase } = context;
const setupPage = nextSetupPage(account);
if (setupPage) window.location.replace(setupPage);
setAccountBadge(account);
const hasClubAccess = account.admins.length > 0;

document.querySelector("#clubSettings").hidden = !hasClubAccess;

document.querySelector("#operatorSettings").hidden =
  account.role !== "operator";

if (hasClubAccess) {
  const clubs = document.querySelector("#assignedClubs");
  for (const club of account.admins) {
    const item = document.createElement("li");
    item.textContent = club.name;
    clubs.append(item);
  }
}
if (["user", "organization_admin"].includes(account.role)) {
  const isAdmin = account.role === "organization_admin";
  document.querySelector("#organizationAccessSettings").hidden = false;
  document.querySelector("#organizationAccessDescription").textContent = isAdmin
    ? "Already managing a club? You can request access to another organization."
    : "Represent a campus club or organization? Request access to manage its events.";
  const action = document.querySelector("#requestOrganizationAccess");
  action.textContent = isAdmin
    ? "Request access to another organization →"
    : "Request admin access →";
  const status = document.querySelector("#organizationAccessStatus");
  const history = document.querySelector("#viewOrganizationRequests");
  // Request history is optional; it must not hold up the rest of Settings.
  apiRequest("organization-access-requests")
    .then(({ requests }) => {
      const pending = requests.filter((request) =>
        ["Pending", "Needs Review"].includes(request.status),
      );
      if (pending.length) {
        status.textContent = pending.length === 1
          ? `Your request for ${pending[0].organization} is awaiting review.`
          : `${pending.length} organization access requests are awaiting review.`;
        action.textContent = "View request →";
        action.href = "/request-organization-access#requestHistory";
        return;
      }
      const latest = requests[0];
      history.hidden = !latest;
      if (!latest) {
        status.textContent = "You haven’t submitted any access requests yet.";
      } else if (latest.status === "Rejected") {
        status.textContent = `Your latest request for ${latest.organization} was rejected. You can review it and apply again.`;
        if (!isAdmin) action.textContent = "Request admin access again →";
      } else if (latest.status === "Approved") {
        status.textContent = `Your latest request for ${latest.organization} was approved. Current access is based on your club assignments.`;
      } else {
        status.textContent = `Latest request for ${latest.organization}: ${latest.status}.`;
      }
    })
    .catch(() => {
      status.textContent = "Your request status couldn’t be loaded. Open the request page to try again.";
      history.hidden = false;
    });
}
initializeSearch(account);
document.querySelector("#profileName").textContent = account.profile.name;
document.querySelector("#profileDetails").textContent =
  `${account.profile.uni} · ${account.profile.level}`;
document.querySelector("#profileBio").textContent =
  account.profile.bio || "No bio yet.";
const logoChoices = document.querySelector("#logoDestination");
const logoStatus = document.querySelector("#logoPreferenceStatus");
let savedLogoDestination = account.launch === "/home" ? "/home" : "/";
logoChoices.querySelector(`input[value="${savedLogoDestination}"]`).checked = true;
logoChoices.onchange = async (event) => {
  const destination = event.target.value;
  logoChoices.disabled = true;
  logoStatus.textContent = "Saving…";
  try {
    await runAction("launch", { launch: destination });
    savedLogoDestination = destination;
    applyLogoDestination(destination);
    logoStatus.textContent = "Logo destination saved.";
  } catch (error) {
    logoChoices.querySelector(`input[value="${savedLogoDestination}"]`).checked = true;
    logoStatus.textContent = `Couldn’t save the logo destination. ${error.message}`;
  } finally {
    logoChoices.disabled = false;
  }
};
document.querySelector("#resetPassword").onclick = async () => {
  const { error } = await supabase.auth.resetPasswordForEmail(
    session.user.email,
    { redirectTo: location.origin },
  );
  showToast(error ? error.message : "Check your email for a reset link.");
};
document.querySelector("#signOut").onclick = async () => {
  await supabase.auth.signOut();
  window.location.assign("/login");
};
const deleteAccountDialog = document.querySelector("#deleteAccountDialog");
const deleteAccountForm = document.querySelector("#deleteAccountForm");
const deleteAccountPassword = document.querySelector("#deleteAccountPassword");
const deleteAccountError = document.querySelector("#deleteAccountError");
const confirmDeleteAccount = document.querySelector("#confirmDeleteAccount");
document.querySelector("#openDeleteAccount").onclick = () =>
  deleteAccountDialog.showModal();
document.querySelector("#cancelDeleteAccount").onclick = () =>
  deleteAccountDialog.close();
deleteAccountDialog.addEventListener("close", () => {
  deleteAccountForm.reset();
  deleteAccountError.hidden = true;
});
deleteAccountForm.onsubmit = async (event) => {
  event.preventDefault();
  if (confirmDeleteAccount.disabled) return;
  deleteAccountError.hidden = true;
  confirmDeleteAccount.disabled = true;
  confirmDeleteAccount.textContent = "Deleting account…";
  try {
    const password = deleteAccountPassword.value;
    deleteAccountPassword.value = "";
    await apiRequest("account/delete", { password });
    await supabase.auth.signOut();
    window.location.assign("/");
  } catch (error) {
    confirmDeleteAccount.disabled = false;
    confirmDeleteAccount.textContent = "Yes, delete my account";
    deleteAccountError.textContent = error.message;
    deleteAccountError.hidden = false;
    deleteAccountPassword.focus();
  }
};



const appFeedbackForm = document.querySelector("#appFeedbackForm");
const appFeedbackStatus = document.querySelector("#appFeedbackStatus");
const submitAppFeedback = document.querySelector("#submitAppFeedback");

function showAppFeedbackConfirmation(rating) {
  appFeedbackForm.hidden = true;

  const confirmation = document.createElement("div");
  confirmation.className = "app-feedback-confirmation";

  const heading = document.createElement("h3");
  heading.textContent = "✓ Thank you for your feedback!";

  const ratingText = document.createElement("p");
  ratingText.textContent = `You rated Cougar Connect ${rating} out of 5 stars.`;

  const message = document.createElement("p");
  message.textContent = "Your feedback has been submitted successfully.";

  confirmation.append(heading, ratingText, message);
  appFeedbackForm.after(confirmation);
}

async function loadAppFeedback() {
  const { data, error } = await supabase
    .from("App Reviews")
    .select("rating, comment")
    .eq("authUserID", session.user.id)
    .maybeSingle();

  if (error) {
    appFeedbackStatus.textContent = "Unable to load your feedback.";
    return;
  }

  if (data) {
    showAppFeedbackConfirmation(data.rating);
  }
}

appFeedbackForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const rating = Number(
    appFeedbackForm.querySelector('input[name="appRating"]:checked')?.value
  );
  const comment = document.querySelector("#appFeedbackComment").value.trim();

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;

  submitAppFeedback.disabled = true;
  appFeedbackStatus.textContent = "Submitting feedback...";

  const { error } = await supabase.from("App Reviews").insert({
    authUserID: session.user.id,
    rating,
    comment: comment || null,
  });

  if (error) {
    submitAppFeedback.disabled = false;
    appFeedbackStatus.textContent = error.code === "23505"
      ? "You have already submitted feedback."
      : `Unable to submit feedback: ${error.message}`;
    return;
  }

  showAppFeedbackConfirmation(rating);
});

loadAppFeedback();


revealPage();
