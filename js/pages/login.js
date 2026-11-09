import { initializeSupabase } from "../shared/api.js";
import { revealPage, showToast } from "../shared/ui.js";

// Read this before Supabase processes the reset link.
const params = new URLSearchParams(location.search);
const hash = new URLSearchParams(location.hash.slice(1));

let recoveryMode =
  params.get("reset") === "1" || hash.get("type") === "recovery";

const supabase = await initializeSupabase();

const authForm = document.querySelector("#authForm");
const passwordInput = authForm.querySelector('[name="password"]');
const authButton = authForm.querySelector('button[name="action"]');

const dialog = document.querySelector("#forgotPasswordDialog");
const resetForm = document.querySelector("#forgotPasswordForm");
const resetEmail = document.querySelector("#resetEmail");
const resetStatus = document.querySelector("#resetPasswordStatus");
const sendButton = document.querySelector("#sendResetLink");

function showRecoveryForm() {
  recoveryMode = true;

  document.querySelector("#authTitle").textContent =
    "Choose a new password";

  const emailLabel = document.querySelector("#emailLabel");
  emailLabel.hidden = true;
  emailLabel.style.setProperty("display", "none", "important");
  emailLabel.querySelector("input").disabled = true;

  document.querySelector("#createAccount")?.setAttribute("hidden", "");
  document.querySelector("#resetPassword")?.setAttribute("hidden", "");
  authForm.querySelector('a[href="/admin-login"]')
    ?.setAttribute("hidden", "");

  passwordInput.closest("label").firstChild.textContent = "New password";
  passwordInput.autocomplete = "new-password";
  passwordInput.value = "";
  authButton.textContent = "Update password";

  if (!document.querySelector("#confirmPassword")) {
    const label = document.createElement("label");
    label.textContent = "Confirm new password";

    const input = document.createElement("input");
    input.id = "confirmPassword";
    input.type = "password";
    input.autocomplete = "new-password";
    input.minLength = 8;
    input.required = true;

    label.appendChild(input);
    authButton.before(label);
  }
}

supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    showRecoveryForm();
    revealPage();
  }
});

if (recoveryMode) showRecoveryForm();

const { data } = await supabase.auth.getSession();

if (data.session && !recoveryMode) {
  window.location.replace("/home");
} else {
  revealPage();

  if (hash.has("error") || params.has("error")) {
    showToast("This reset link is invalid or expired. Request a new one.");
  } else if (recoveryMode && !data.session) {
    showToast("Request a new reset link and open it from your email.");
  }
}

// Sign in, create an account, or save the new password.
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const values = Object.fromEntries(new FormData(authForm));

  if (recoveryMode) {
    const confirmation = document.querySelector("#confirmPassword");

    if (values.password !== confirmation.value) {
      showToast("Your passwords do not match.");
      confirmation.focus();
      return;
    }
  }

  authButton.disabled = true;

  try {
    if (recoveryMode) {
      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session) {
        throw new Error(
          "Your reset link expired. Return to Sign in and request a new one."
        );
      }

      const result = await supabase.auth.updateUser({
        password: values.password,
      });

      if (result.error) throw result.error;

      showToast("Password updated! Opening your home page...");
      window.location.replace("/home");
      return;
    }

    const result =
      event.submitter?.value === "signup"
        ? await supabase.auth.signUp({
            email: values.email,
            password: values.password,
            options: { emailRedirectTo: location.origin },
          })
        : await supabase.auth.signInWithPassword({
            email: values.email,
            password: values.password,
          });

    if (result.error) throw result.error;

    if (result.data.session) {
      window.location.assign("/home");
    } else {
      showToast("Check your email to confirm your account, then sign in.");
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    authButton.disabled = false;
  }
});

document.querySelector("#createAccount")?.addEventListener("click", () => {
  window.location.assign("/signup");
});

// Open the independent email popup.
document.querySelector("#resetPassword")?.addEventListener("click", () => {
  resetForm.reset();
  resetStatus.textContent = "";
  sendButton.disabled = false;
  sendButton.textContent = "Send reset link";
  dialog.showModal();
  resetEmail.focus();
});

document.querySelector("#closeForgotPassword")?.addEventListener("click", () => {
  dialog.close();
});

// Send the recovery email using the popup's email field.
resetForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  sendButton.disabled = true;
  sendButton.textContent = "Sending...";
  resetStatus.textContent = "";

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(
      resetEmail.value.trim(),
      {
        redirectTo: `${location.origin}/login?reset=1`,
      }
    );

    if (error) throw error;

    resetStatus.textContent =
      "If an account exists for that email, you’ll receive a reset link. Check your inbox and spam folder.";
    sendButton.textContent = "Link requested";
  } catch (error) {
    resetStatus.textContent = error.message;
    sendButton.disabled = false;
    sendButton.textContent = "Send reset link";
  }
});