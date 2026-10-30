import { nextSetupPage, requireAccount } from "../shared/auth.js";
import { revealPage, setAccountBadge } from "../shared/ui.js";
import { initializeSearch } from "../shared/search.js";

const context = await requireAccount();
if (context) {
  const setupPage = nextSetupPage(context.account);
  if (setupPage) window.location.replace(setupPage);
  else {
    setAccountBadge(context.account);
    initializeSearch(context.account);
    revealPage();
  }
}
