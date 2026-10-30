import { nextSetupPage, requireAccount } from "../shared/auth.js";
import { bindEventCards, eventCards } from "../shared/events.js";
import { initializeSearch } from "../shared/search.js";
import { revealPage, setAccountBadge } from "../shared/ui.js";

let account;
async function loadHome() {
  const context = await requireAccount();
  if (!context) return;
  account = context.account;
  const setupPage = nextSetupPage(account);
  if (setupPage) return window.location.replace(setupPage);
  setAccountBadge(account);
  document.querySelector("#firstName").textContent =
    account.profile.name.split(" ")[0];
  document.querySelector("#savedCount").textContent =
    `${account.saved.length} saved`;
  document.querySelector("#savedEvents").innerHTML = eventCards(
    account.events.filter((event) => account.saved.includes(event.id)),
    account.saved,
  );
  document.querySelector("#recommendedEvents").innerHTML = eventCards(
    account.events.filter((event) =>
      event.genres.some((genre) => account.interests.includes(genre)),
    ),
    account.saved,
  );
  bindEventCards(account, loadHome);
  initializeSearch(account, loadHome);
  revealPage();
}
await loadHome();
