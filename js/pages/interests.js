import { requireAccount } from "../shared/auth.js";
import { runAction } from "../shared/api.js";
import { escapeHtml, revealPage, showToast } from "../shared/ui.js";

const context = await requireAccount();
if (!context) throw new Error("Authentication required");
const { account } = context;
let selected = [...account.interests];

function renderChoices() {
  document.querySelector("#interestChoices").innerHTML = account.categories
    .map(
      (interest) =>
        `<button class="choice ${selected.includes(interest) ? "selected" : ""}" data-interest="${escapeHtml(interest)}">${selected.includes(interest) ? "☑" : "□"} ${escapeHtml(interest)}</button>`,
    )
    .join("");
  document.querySelector("#interestCount").textContent =
    `${selected.length} selected · ${Math.max(0, 3 - selected.length)} more needed`;
  document.querySelector("#saveInterests").disabled = selected.length < 3;
  document.querySelectorAll("[data-interest]").forEach((button) => {
    button.onclick = () => {
      const interest = button.dataset.interest;
      selected = selected.includes(interest)
        ? selected.filter((item) => item !== interest)
        : [...selected, interest];
      renderChoices();
    };
  });
}

document.querySelector("#saveInterests").onclick = async () => {
  try {
    await runAction("interests", selected);
    window.location.assign("/home");
  } catch (error) {
    showToast(error.message);
  }
};
renderChoices();
revealPage();
