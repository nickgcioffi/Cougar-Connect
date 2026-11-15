import { initializeSupabase, apiRequest } from "../shared/api.js";
const original = new Map(
  [...document.querySelectorAll('a[href="/login"],a[href="/signup"]')].map(
    (a) => [a, { html: a.innerHTML, href: a.getAttribute("href") }],
  ),
);
function revealAuthLinks() {
  clearTimeout(window.ccLandingAuthTimeout);
  document.documentElement.classList.remove("landing-auth-pending");
  document.documentElement.classList.add("landing-auth-ready");
}
let version = 0;
async function update() {
  const current = ++version;
  try {
    const supabase = await initializeSupabase();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const account = data.session ? await apiRequest("account-summary") : null;
    if (current !== version) return;
    // A UI hint only. Authentication always uses the validated Supabase session.
    document.cookie = `cc_signed_in=${account ? "1" : ""}; Path=/; SameSite=Lax; Max-Age=${account ? 2592000 : 0}${location.protocol === "https:" ? "; Secure" : ""}`;
    for (const [a, old] of original) {
      a.setAttribute(
        "href",
        account ? (old.href === "/login" ? "/settings" : "/home") : old.href,
      );
      a.innerHTML = old.html;
      if (account)
        a.textContent =
          old.href === "/login" ? "Your account" : "Open Cougar Connect";
    }
    const mobile = document.body.hasAttribute("data-mobile");
    let state = document.querySelector("#landingSession");
    if (!state) {
      state = document.createElement(mobile ? "a" : "span");
      state.id = "landingSession";
      state.className = "landing-session";
      if (mobile) state.href = "/home";
      document.querySelector(".landing-header").append(state);
    }
    state.hidden = !account;
    if (account)
      state.textContent = `Signed in${account.firstName ? ` as ${account.firstName}` : ""}${mobile ? " · Open app →" : ""}`;
  } catch {
    if (current !== version) return;
    for (const [a, old] of original) {
      a.setAttribute("href", old.href);
      a.innerHTML = old.html;
    }
    const state = document.querySelector("#landingSession");
    if (state) state.hidden = true;
    document.cookie = "cc_signed_in=; Path=/; Max-Age=0; SameSite=Lax";
  } finally {
    if (current === version) revealAuthLinks();
  }
}
try {
  const supabase = await initializeSupabase();
  supabase.auth.onAuthStateChange((event) => {
    // The explicit initial update already reads the current session.
    if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
    setTimeout(update, 0);
  });
  await update();
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) update();
  });
} catch {
  revealAuthLinks();
}
