import { finishSetupDestination } from "../shared/return-path.js";
import { requireAccount } from "../shared/auth.js";
import { runAction } from "../shared/api.js";
import { escapeHtml, revealPage, showToast } from "../shared/ui.js";

const context = await requireAccount();
if (!context) throw new Error("Authentication required");
const { account } = context;
const editing = window.location.pathname.startsWith("/settings/");
const saveButton = document.querySelector("#saveInterests");
let selected = [...account.interests];

if (editing) {
  document.title = "Edit interests · Cougar Connect";
  document.querySelector(".demo").textContent = "ACCOUNT SETTINGS";
  const layout = document.querySelector("#interestsLayout");
  layout.className = "settings";
  layout.querySelector(".intro").remove();
  const section = layout.querySelector(".formside");
  section.className = "panel";
  section.querySelector(".eyebrow").remove();
  document.querySelector("#interestsHeading").textContent = "Edit interests";
  saveButton.textContent = "Save changes";
  document.querySelector("#interestsBack").remove();
  document.querySelector("#cancelEdit").hidden = false;
}

function renderChoices() {
  document.querySelector("#interestChoices").innerHTML = account.categories
    .map(
      (interest) =>
        `<button class="choice ${selected.includes(interest) ? "selected" : ""}" data-interest="${escapeHtml(interest)}">${selected.includes(interest) ? "☑" : "□"} ${escapeHtml(interest)}</button>`,
    )
    .join("");
  document.querySelector("#interestCount").textContent =
    `${selected.length} selected · ${Math.max(0, 3 - selected.length)} more needed`;
  saveButton.disabled = selected.length < 3;
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

saveButton.onclick = async () => {
  try {
    await runAction("interests", selected);
    window.location.assign(editing ? "/settings" : finishSetupDestination());
  } catch (error) {
    showToast(error.message);
  }
};
renderChoices();
revealPage();
