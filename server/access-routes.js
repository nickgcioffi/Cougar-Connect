import {
  reviewOrganizationAccessRequest,
  sendOrganizationAccessNotification,
} from "./organization-access.js";
const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status, publicMessage: true });
export function registerAccessRoutes(app, adminDb) {
  const available = () => {
    if (!adminDb) throw fail("Organization requests are not configured.", 503);
  };
  const operator = async (req) => {
    const user = unwrap(
      await req.db
        .from("User")
        .select("role")
        .eq("authUserID", req.user.id)
        .maybeSingle(),
    );
    if (user?.role !== "operator") throw fail("Operator access required.", 403);
  };
  app.post("/api/organization-access-request", async (req, res, next) => {
    try {
      available();
      const profile = unwrap(
        await req.db
          .from("User")
          .select("firstName,lastName")
          .eq("authUserID", req.user.id)
          .maybeSingle(),
      );
      if (!profile)
        throw fail(
          "Create your profile before requesting organization access.",
        );
      if (!req.user.email) throw fail("Your account needs an email address.");
      const request = {
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: req.user.email.toLowerCase(),
      };
      for (const [field, limit] of Object.entries({
        organization: 150,
        position: 100,
        reason: 2000,
      })) {
        const value = req.body?.[field];
        if (
          typeof value !== "string" ||
          !value.trim() ||
          value.trim().length > limit
        )
          throw fail(`Complete ${field} (maximum ${limit} characters).`);
        request[field] = value.trim();
      }
      const saved = unwrap(
        await adminDb.rpc("submit_access_request", {
          applicant_id: req.user.id,
          request_payload: request,
        }),
      );
      const review = await reviewOrganizationAccessRequest(request);
      // Text screening cannot establish affiliation. Every potential grant needs an operator.
      let status = review.status === "Rejected" ? "Rejected" : "Needs Review";
      const result = await adminDb
        .from("Organization Access Requests")
        .update({
          status,
          aiRecommendation: review.status,
          aiRationale: review.rationale,
        })
        .eq("requestID", saved.requestID)
        .eq("status", "Pending")
        .select("status");
      if (!result.error && result.data?.length === 0) {
        const current = unwrap(
          await adminDb
            .from("Organization Access Requests")
            .select("status")
            .eq("requestID", saved.requestID)
            .single(),
        );
        return res.status(201).json({
          ok: true,
          requestID: saved.requestID,
          status: current.status,
          notificationSent: false,
        });
      }
      if (result.error) status = "Pending"; // The saved request remains recoverable for an operator.
      const notificationSent = await sendOrganizationAccessNotification(
        request,
        status,
      );
      res.status(201).json({
        ok: true,
        requestID: saved.requestID,
        status,
        notificationSent,
      });
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/organization-access-requests", async (req, res, next) => {
    try {
      const requests = unwrap(
        await req.db
          .from("Organization Access Requests")
          .select("*")
          .eq("authUserID", req.user.id)
          .order("createdAt", { ascending: false }),
      );
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Denver",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const today = day.format(new Date());
      const used = requests.filter(
        (r) => day.format(new Date(r.createdAt)) === today,
      ).length;
      res.json({ requests, remaining: Math.max(0, 3 - used), limit: 3 });
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/operator/access", async (req, res, next) => {
    try {
      await operator(req);
      available();
      const requests = unwrap(
        await req.db
          .from("Organization Access Requests")
          .select("*")
          .order("createdAt", { ascending: false }),
      );
      const memberships = unwrap(
        await adminDb
          .from("Organization Admins")
          .select("authUserID,orgID,Organization!orgID(orgName)"),
      );
      res.json({ requests, memberships });
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/operator/access/decision", async (req, res, next) => {
    try {
      await operator(req);
      const { requestID, decision, orgID } = req.body || {};
      if (
        !Number.isSafeInteger(requestID) ||
        !["Approved", "Rejected"].includes(decision) ||
        (decision === "Approved" && !Number.isSafeInteger(orgID))
      )
        throw fail("Choose a request, decision and organization.");
      const row = unwrap(
        await req.db.rpc("decide_access_request", {
          target_request_id: requestID,
          decision,
          target_org_id: decision === "Approved" ? orgID : null,
        }),
      );
      const request = Array.isArray(row) ? row[0] : row;
      const notificationSent = await sendOrganizationAccessNotification(
        request,
        decision,
      );
      res.json({ ok: true, notificationSent });
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/operator/organizations", async (req, res, next) => {
    try {
      await operator(req);
      const name = req.body?.name;
      if (typeof name !== "string" || !name.trim() || name.trim().length > 150)
        throw fail("Enter an organization name of 1–150 characters.");
      const result = unwrap(
        await req.db.rpc("create_organization", { organization_name: name }),
      );
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/operator/access/revoke", async (req, res, next) => {
    try {
      await operator(req);
      const { authUserID, orgID } = req.body || {};
      if (
        typeof authUserID !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(authUserID) ||
        !Number.isSafeInteger(orgID)
      )
        throw fail("Select a valid assignment.");
      unwrap(
        await req.db.rpc("revoke_organization_access", {
          target_user_id: authUserID,
          target_org_id: orgID,
        }),
      );
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });
}
