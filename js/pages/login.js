import { initializeSupabase } from "../shared/api.js";
import { revealPage, showToast } from "../shared/ui.js";

const supabase = await initializeSupabase();
let recoveryMode = false;

supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    recoveryMode = true;
    document.querySelector("#authTitle").textContent = "Choose a new password";
    document.querySelector("#emailLabel").hidden = true;
    document.querySelector('[value="signup"]').hidden = true;
    document.querySelector('[value="login"]').textContent = "Update password";
  }
});

const { data } = await supabase.auth.getSession();
if (data.session && !recoveryMode) window.location.replace("/home");
else revealPage();

document
  .querySelector("#authForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const { email, password } = Object.fromEntries(new FormData(event.target));
    try {
      const result = recoveryMode
        ? await supabase.auth.updateUser({ password })
        : event.submitter.value === "signup"
          ? await supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: location.origin },
            })
          : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (recoveryMode || result.data.session) window.location.assign("/home");
      else showToast("Check your email to confirm your account, then sign in.");
    } catch (error) {
      showToast(error.message);
    }
  });

document.querySelector("#resetPassword").onclick = async () => {
  const email = document.querySelector('[name="email"]');
  if (!email.checkValidity())
    return showToast("Enter a valid email address first.");
  const { error } = await supabase.auth.resetPasswordForEmail(email.value, {
    redirectTo: location.origin,
  });
  showToast(error ? error.message : "Check your email for a reset link.");
};
