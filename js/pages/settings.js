import { nextSetupPage, requireAccount } from "../shared/auth.js";
import { apiRequest, runAction } from "../shared/api.js";
import { revealPage, setAccountBadge, showToast } from "../shared/ui.js";
import { initializeSearch } from "../shared/search.js";

const context = await requireAccount();
if (!context) throw new Error("Authentication required");
const { account, session, supabase } = context;
const setupPage = nextSetupPage(account);
if (setupPage) window.location.replace(setupPage);
setAccountBadge(account);
initializeSearch(account);
document.querySelector("#profileName").textContent = account.profile.name;
document.querySelector("#profileDetails").textContent =
  `${account.profile.uni} · ${account.profile.level}`;
document.querySelector("#profileBio").textContent =
  account.profile.bio || "No bio yet.";
document.querySelector("#launchPreference").value = account.launch;
document.querySelector("#launchPreference").onchange = async (event) => {
  try {
    await runAction("launch", { launch: event.target.value });
    showToast("Launch preference saved");
  } catch (error) {
    showToast(error.message);
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
revealPage();
