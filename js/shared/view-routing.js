// Keep this breakpoint aligned with mobileBreakpoint in server.js and the
// existing navigation breakpoint in css/styles.css.
(() => {
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
