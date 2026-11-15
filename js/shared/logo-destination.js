export function applyLogoDestination(destination) {
  const target = destination === "/home" ? "/home" : "/";
  document.querySelectorAll("a.brand").forEach((logo) => {
    logo.href = target;
    logo.dataset.destinationReady = "true";
  });
}
