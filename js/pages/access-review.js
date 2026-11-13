import { requireAccount } from "../shared/auth.js";
import { apiRequest } from "../shared/api.js";
import { escapeHtml } from "../shared/ui.js";
const context = await requireAccount();
if (context) {
  const { account } = context;
  const root = document.querySelector("#accessReviews");
  const status = document.querySelector("#reviewStatus");
  if (account.role !== "operator")
    root.textContent = "Operator access is required to review requests.";
  else {
    document.querySelector("#organizationCreation").hidden = false;
    const createForm = document.querySelector("#createOrganizationForm");
    createForm.onsubmit = async (event) => {
      event.preventDefault();
      const button = createForm.querySelector("button");
      const feedback = document.querySelector("#organizationStatus");
      button.disabled = true;
      feedback.textContent = "Saving organization…";
      try {
        const result = await apiRequest("operator/organizations", {
          name: createForm.elements.name.value,
        });
        const organization = result.organization;
        if (!account.organizations.some((o) => o.id === organization.id))
          account.organizations.push(organization);
        account.organizations.sort((a, b) => a.name.localeCompare(b.name));
        // Preserve review selections and other in-progress work while refreshing options.
        root
          .querySelectorAll('[aria-label="Verified organization"]')
          .forEach((select) => {
            const selected = select.value;
            select.replaceChildren(
              new Option("Select organization", ""),
              ...account.organizations.map((o) => new Option(o.name, o.id)),
            );
            select.value = selected;
          });
        feedback.textContent = result.created
          ? `Added ${organization.name}. You can now select it below.`
          : `${organization.name} already exists and is available below.`;
        createForm.reset();
      } catch (error) {
        feedback.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
    async function render() {
      const { requests, memberships } = await apiRequest("operator/access");
      root.innerHTML = `
        <section class="operator-section" aria-labelledby="requestsTitle">
          <h2 id="requestsTitle">Access requests</h2>
          ${
            requests
              .map(
                (r) => `
            <article class="panel operator-request" data-request="${r.requestID}">
              <div class="request-heading">
                <h3>${escapeHtml(r.organization)}</h3>
                <p>${escapeHtml(r.firstName)} ${escapeHtml(r.lastName)} · ${escapeHtml(r.email)}</p>
              </div>
              <dl class="request-details">
                <div><dt>Position</dt><dd>${escapeHtml(r.position)}</dd></div>
                <div><dt>Reason</dt><dd>${escapeHtml(r.reason)}</dd></div>
              </dl>
              <div class="request-review-summary">
                <div><span class="review-label">Status</span><strong>${escapeHtml(r.status)}</strong></div>
                <div><span class="review-label">AI recommendation</span><strong>${escapeHtml(r.aiRecommendation || "Not available")}</strong>${r.aiRationale ? `<p>${escapeHtml(r.aiRationale)}</p>` : ""}</div>
              </div>
              ${
                ["Pending", "Needs Review"].includes(r.status)
                  ? `
                <div class="request-decision">
                  <label>Verified organization<select aria-label="Verified organization"><option value="">Select organization</option>${account.organizations.map((o) => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join("")}</select></label>
                  <p>Confirm the applicant’s affiliation and authority before approving.</p>
                  <div class="operator-actions"><button data-decision="Approved">Approve verified access</button><button data-decision="Rejected">Reject request</button></div>
                </div>`
                  : ""
              }
            </article>`,
              )
              .join("") || "<p>No requests yet.</p>"
          }
        </section>
        <section class="operator-section" aria-labelledby="assignmentsTitle">
          <h2 id="assignmentsTitle">Current organization assignments</h2>
          ${memberships.map((m, i) => `<div class="panel operator-assignment"><div><h3>${escapeHtml(m.Organization?.orgName)}</h3><p>Account ${escapeHtml(m.authUserID)}</p></div><button data-revoke="${i}">Revoke organization access</button></div>`).join("") || "<p>No assignments.</p>"}
        </section>`;
      root.querySelectorAll("[data-decision]").forEach(
        (button) =>
          (button.onclick = async () => {
            const row = button.closest("[data-request]");
            const decision = button.dataset.decision;
            const orgID = Number(row.querySelector("select").value);
            if (decision === "Approved" && !orgID) {
              status.textContent = "Select the verified organization first.";
              return;
            }
            if (
              !confirm(
                decision === "Approved"
                  ? "Confirm you verified this applicant’s authority to manage this organization?"
                  : "Reject this request?",
              )
            )
              return;
            button.disabled = true;
            try {
              const result = await apiRequest("operator/access/decision", {
                requestID: Number(row.dataset.request),
                decision,
                orgID,
              });
              status.textContent = `Decision saved.${result.notificationSent ? " Notification email sent." : " Notification email was not sent."}`;
              await render();
            } catch (error) {
              status.textContent = error.message;
              button.disabled = false;
            }
          }),
      );
      root.querySelectorAll("[data-revoke]").forEach(
        (button) =>
          (button.onclick = async () => {
            if (!confirm("Remove this account’s access to this organization?"))
              return;
            button.disabled = true;
            try {
              const { authUserID, orgID } =
                memberships[Number(button.dataset.revoke)];
              await apiRequest("operator/access/revoke", { authUserID, orgID });
              status.textContent = "Organization assignment removed.";
              await render();
            } catch (error) {
              status.textContent = error.message;
              button.disabled = false;
            }
          }),
      );
    }
    try {
      await render();
    } catch (error) {
      status.textContent = error.message;
    }
  }
}
