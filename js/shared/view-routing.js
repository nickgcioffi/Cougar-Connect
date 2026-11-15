// Keep this breakpoint aligned with mobileBreakpoint in server.js and the
// existing navigation breakpoint in css/styles.css.
(() => {
  // Static public pages resolve a signed-in account's preference on logo clicks.
  // App pages already set the href when their account data loads.
  document.addEventListener("click", async (event) => {
    const logo = event.target.closest?.("a.brand");
    if (!logo || logo.dataset.destinationReady || event.defaultPrevented ||
        event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    let destination = "/";
    try {
      const { initializeSupabase, apiRequest } = await import("./api.js");
      const supabase = await initializeSupabase();
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const account = await apiRequest("account-summary");
        destination = account.launch === "/home" ? "/home" : "/";
      }
    } catch {}
    window.location.assign(destination);
  });
  const hostname = window.location.hostname.toLowerCase();
  // Explicit view URLs and the mobile hostname always keep their chosen view.
  if (
    hostname === "mobile.cougarconnect.app" ||
    window.location.pathname.startsWith("/views/")
  )
    return;

  const mainHost =
    hostname === "www.cougarconnect.app" || hostname === "cougarconnect.app";
  const viewport = window.matchMedia("(max-width: 760px)");
  const currentView = document.querySelector('meta[name="cc-view"]').content;

  function routeViewport() {
    const variant = viewport.matches ? "mobile" : "desktop";
    if (mainHost) {
      if (variant === "mobile") {
        const target = new URL(window.location.href);
        target.hostname = "mobile.cougarconnect.app";
        target.protocol = "https:";
        target.port = "";
        window.location.replace(target.href);
      }
      return;
    }

    // Allow responsive previews on localhost without sending them to production.
    document.cookie = `cc_viewport=${variant}; Path=/; SameSite=Lax`;
    if (
      variant !== currentView &&
      document.cookie.includes(`cc_viewport=${variant}`)
    ) {
      window.location.reload();
    }
  }

  routeViewport();
  viewport.addEventListener("change", routeViewport);
})();
