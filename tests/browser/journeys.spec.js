import { test, expect } from "@playwright/test";

async function fixture(page, { profile = true, signedIn = true } = {}) {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;
  const event = {
    id: 12,
    name: "Technology meetup",
    date,
    time: "18:00",
    location: "Campus",
    org: "Test Club",
    orgID: 7,
    genre: "Technology",
    genres: ["Technology"],
    type: "Social",
    desc: "Meet fellow students",
  };
  const account = {
    profile: profile
      ? {
          name: "Test Applicant",
          uni: "BYU",
          level: "Undergraduate",
          graduation: "2030-04",
          bio: "Original bio",
          photo: null,
        }
      : null,
    interests: profile ? ["Technology", "Service", "Research"] : [],
    categories: ["Technology", "Service", "Research", "Sports"],
    saved: [],
    events: [event],
    admins: [],
    organizations: [],
    launch: "Home",
  };
  const uploads = [];
  await page.addInitScript(
    ({ signedIn }) => {
      if (!sessionStorage.getItem("initialized")) {
        sessionStorage.setItem("initialized", "yes");
        if (signedIn) sessionStorage.setItem("session", "yes");
      }
    },
    { signedIn },
  );
  // Real page scripts and DOM run in Chromium. Auth and API services are fixtures.
  await page.route("**/js/vendor/supabase.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
 window.createSupabaseClient=()=>({auth:{
 getSession:async()=>({data:{session:sessionStorage.getItem('session')?{access_token:'test',user:{id:'test-user',email:'test@example.invalid'}}:null}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
 signUp:async()=>({data:{session:null},error:null}),
 signInWithPassword:async({password})=>{if(password!=='test-password')return {error:{message:'Invalid login credentials'}};sessionStorage.setItem('session','yes');return {data:{session:{access_token:'test'}},error:null}},
 signOut:async()=>{sessionStorage.removeItem('session');return {error:null}},
 resetPasswordForEmail:async(email,options)=>{await fetch('/__test/reset',{method:'POST',body:JSON.stringify({email,options})});return {error:null}},
 updateUser:async()=>({error:null})},storage:{from:()=>({upload:async(path,file)=>{await fetch('/__test/upload',{method:'POST',body:JSON.stringify({path,type:file.type})});return {error:null}},getPublicUrl:path=>({data:{publicUrl:'https://example.invalid/'+path}})})}});
 `,
    }),
  );
  await page.route("**/__test/**", async (route) => {
    uploads.push({
      url: route.request().url(),
      body: route.request().postDataJSON(),
    });
    await route.fulfill({ json: {} });
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/config")
      return route.fulfill({
        json: { url: "https://example.invalid", key: "test" },
      });
    if (url.pathname === "/api/state") return route.fulfill({ json: account });
    if (url.pathname === "/api/events/search")
      return route.fulfill({
        json: url.searchParams.get("q").includes("technology") ? [event] : [],
      });
    if (url.pathname === "/api/action") {
      const { action, payload } = route.request().postDataJSON();
      if (action === "profile") account.profile = payload;
      if (action === "interests") account.interests = payload;
      if (action === "save") account.saved = payload.saved ? [payload.id] : [];
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname === "/api/organization-access-requests")
      return route.fulfill({ json: { requests: [], remaining: 3, limit: 3 } });
    if (url.pathname === "/api/organization-access-request")
      return route.fulfill({
        status: 201,
        json: { ok: true, status: "Needs Review", notificationSent: true },
      });
    return route.fulfill({
      status: 404,
      json: { error: "Unexpected fixture route" },
    });
  });
  return { account, uploads };
}

test("signup confirmation message, login, and signout", async ({ page }) => {
  await fixture(page, { signedIn: false });
  await page.goto("/signup");
  await page.locator("[name=email]").fill("test@example.invalid");
  await page.locator("[name=password]").fill("test-password");
  await page.locator("button[name=action]").click();
  await expect(page.locator("#messagePopup")).toContainText(
    "confirm your account",
  );
  await page.goto("/login");
  await page.locator("[name=email]").fill("test@example.invalid");
  await page.locator("[name=password]").fill("wrong-password");
  await page.locator("button[name=action]").click();
  await expect(page.locator("#messagePopup")).toContainText("Invalid login");
  await page.locator("#messagePopup button").click();
  await page.locator("[name=password]").fill("test-password");
  await page.locator("button[name=action]").click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/settings");
  await page.locator("#signOut").click();
  await expect(page).toHaveURL(/\/login$/);
});

test("profile onboarding, photo upload, interest selection, refresh and relogin", async ({
  page,
}) => {
  const { account, uploads } = await fixture(page, { profile: false });
  await page.goto("/home");
  await expect(page).toHaveURL(/\/profile$/);
  await page.locator("[name=name]").fill("New Student");
  await page.locator("[name=graduationYear]").selectOption("2030");
  await page.locator('[name=graduationMonth][value="04"]').check();
  await page.locator("[name=bio]").fill("Distinctive test biography");
  await page.locator("#photo").setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4S8AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.locator("#profileForm button").click();
  await expect(page).toHaveURL(/\/interests$/);
  await expect(page.locator("#saveInterests")).toBeDisabled();
  for (const interest of ["Technology", "Service", "Research"])
    await page.locator(`[data-interest="${interest}"]`).click();
  await page.locator("#saveInterests").click();
  await expect(page).toHaveURL(/\/home$/);
  expect(
    uploads.some((item) => item.body.path === "test-user/avatar"),
  ).toBeTruthy();
  expect(account.profile.photo).toContain("test-user/avatar");
  await page.goto("/settings/profile");
  await page.reload();
  await expect(page.locator("[name=name]")).toHaveValue("New Student");
  await expect(page.locator("[name=bio]")).toHaveValue(
    "Distinctive test biography",
  );
  await page.goto("/settings");
  await page.locator("#signOut").click();
  await page.locator("[name=email]").fill("test@example.invalid");
  await page.locator("[name=password]").fill("test-password");
  await page.locator("button[name=action]").click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/settings/profile");
  await expect(page.locator("[name=name]")).toHaveValue("New Student");
});

test("password reset request and recovery form", async ({ page }) => {
  const { uploads } = await fixture(page, { signedIn: false });
  await page.goto("/login");
  await page.locator("#resetPassword").click();
  await page.locator("#resetEmail").fill("test@example.invalid");
  await page.locator("#sendResetLink").click();
  await expect(page.locator("#resetPasswordStatus")).toContainText(
    "receive a reset link",
  );
  expect(uploads[0].body.options.redirectTo).toContain("/login?reset=1");
  await page.evaluate(() => sessionStorage.setItem("session", "yes"));
  await page.goto("/login?reset=1");
  await expect(page.locator("#authTitle")).toContainText("new password");
  await page.locator("[name=password]").fill("replacement-password");
  await page.locator("#confirmPassword").fill("replacement-password");
  await page.locator("button[name=action]").click();
  await expect(page).toHaveURL(/\/home$/);
});

test("search, event details, saving and unsaving, filters, and month navigation", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/home");
  await page.locator("#search").fill("technology");
  await page.locator('[data-search-event="12"]').click();
  await expect(page.locator("#detail")).toContainText("Meet fellow students");
  await page.locator("#saveEvent").click();
  await expect(page.locator("#savedCount")).toContainText("1 saved");
  await page.locator('#savedEvents [data-event-id="12"]').click();
  await page.locator("#saveEvent").click();
  await expect(page.locator("#savedCount")).toContainText("0 saved");
  await page.goto("/calendar");
  await expect(page.locator("#calendarGrid")).toContainText(
    "Technology meetup",
  );
  if (await page.locator(".mobile-filters").count())
    await page.locator(".mobile-filters summary").click();
  await page.locator("#genreFilter").selectOption("Sports");
  await expect(page.locator("#emptyCalendar")).toBeVisible();
  await page.locator("#clearFilters").click();
  await expect(page.locator("#calendarGrid")).toContainText(
    "Technology meetup",
  );
  const month = await page.locator("#monthTitle").textContent();
  await page.locator("#nextMonth").click();
  await expect(page.locator("#monthTitle")).not.toHaveText(month);
  await page.locator("#previousMonth").click();
  await expect(page.locator("#monthTitle")).toHaveText(month);
});

test("request access form displays the persisted outcome and email status", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/request-organization-access");
  for (const [name, value] of Object.entries({
    organization: "Test Club",
    position: "Officer",
    reason: "Publish events",
  }))
    await page.locator(`[name="${name}"]`).fill(value);
  await page.locator("#submitRequest").click();
  await expect(page.locator("#formMessage")).toContainText(
    "pending human review",
  );
  await expect(page.locator("#formMessage")).toContainText(
    "notification email was sent",
  );
});

test("mobile agenda opens details and saves an event with touch controls", async ({
  page,
}) => {
  const { account } = await fixture(page);
  await page.goto("/views/mobile/calendar.html");
  await expect(page.locator(".agenda-event")).toContainText(
    "Technology meetup",
  );
  await expect(page.locator("#showMonth")).toBeDisabled();
  await expect(page.locator("#showMonth")).toHaveText("Showing whole month");
  await page.locator("#agendaDate").fill(account.events[0].date);
  await expect(page.locator("#showMonth")).toBeEnabled();
  await page.locator("#showMonth").click();
  await expect(page.locator("#agendaDate")).toHaveValue("");
  await expect(page.locator("#showMonth")).toBeDisabled();
  await page.locator("#agendaDate").fill(account.events[0].date);
  await page.locator(".agenda-event").click();
  await expect(page.locator("#detail")).toBeVisible();
  await page.locator("#saveEvent").click();
  await expect(page.locator("#detail")).not.toBeVisible();
  await page.locator(".agenda-event").click();
  await expect(page.locator("#saveEvent")).toContainText("Saved");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  const nav = await page
    .locator('nav[aria-label="Main navigation"] a')
    .first()
    .boundingBox();
  expect(nav.height).toBeGreaterThanOrEqual(48);
});

test("mobile landing header offers admin access at phone widths", async ({
  page,
}) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/views/mobile/index.html");
    const header = page.locator(".landing-header");
    await expect(
      header.locator('a[href="/login"], a[href="/signup"]'),
    ).toHaveCount(0);
    const action = header.getByRole("link", { name: "Request admin access" });
    await expect(action).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    const brand = await header.locator(".brand").boundingBox();
    const button = await action.boundingBox();
    expect(
      Math.abs(brand.y + brand.height / 2 - (button.y + button.height / 2)),
    ).toBeLessThan(2);
    await action.click();
    await expect(page).toHaveURL(/request-organization-access/);
  }
});

test("landing reflects the remembered session and clears it after sign out", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  await expect(page.locator("#landingSession")).toContainText(
    "Signed in as Test",
  );
  const mobile = await page.locator("body").getAttribute("data-mobile");
  if (mobile) {
    await expect(page.locator("#landingSession")).toHaveAttribute(
      "href",
      "/home",
    );
    await expect(page.locator("#landingSession")).toContainText("Open app");
  } else {
    await expect(page.locator("#landingSession")).toHaveJSProperty(
      "tagName",
      "SPAN",
    );
    await expect(page.locator("#landingSession")).toHaveText(
      "Signed in as Test",
    );
  }
  await expect(page.locator('.cc-actions a[href="/home"]')).toHaveText(
    "Open Cougar Connect",
  );
  await page.reload();
  await expect(page.locator("#landingSession")).toBeVisible();
  expect(
    (await page.context().cookies()).some(
      (c) => c.name === "cc_signed_in" && c.value === "1",
    ),
  ).toBeTruthy();
  await page.goto("/settings");
  await page.locator("#signOut").click();
  await page.goto("/");
  await expect(page.locator("#landingSession")).toBeHidden();
  await expect(page.locator('.cc-actions a[href="/signup"]')).toBeVisible();
});

test("access request returns through login and uses the account identity", async ({
  page,
}) => {
  await fixture(page, { signedIn: false });
  await page.goto("/request-organization-access");
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.locator('[name="email"]').fill("test@example.invalid");
  await page.locator('[name="password"]').fill("test-password");
  await page.locator('button[name="action"]').click();
  await expect(page).toHaveURL(/\/request-organization-access$/);
  await expect(page.locator('[name="email"]')).toHaveValue(
    "test@example.invalid",
  );
  await expect(page.locator('[name="email"]')).toHaveAttribute("readonly", "");
  for (const [name, value] of Object.entries({
    organization: "Test Club",
    position: "Officer",
    reason: "Manage our club events",
  }))
    await page.locator(`[name="${name}"]`).fill(value);
  await page.locator("#submitRequest").click();
  await expect(page.locator("#formMessage")).toContainText(
    "pending human review",
  );
});

test("operator can choose an organization, approve and revoke an assignment", async ({
  page,
}) => {
  const { account } = await fixture(page);
  account.role = "operator";
  account.organizations = [{ id: 7, name: "Test Club" }];
  let approved = false,
    revoked = false;
  await page.route("**/api/operator/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/decision")) {
      expect(route.request().postDataJSON()).toEqual({
        requestID: 1,
        decision: "Approved",
        orgID: 7,
      });
      approved = true;
      return route.fulfill({ json: { ok: true, notificationSent: true } });
    }
    if (path.endsWith("/revoke")) {
      revoked = true;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: {
        requests: [
          {
            requestID: 1,
            firstName: "Test",
            lastName: "Applicant",
            email: "test@example.invalid",
            organization: "Test Club",
            position: "Officer",
            reason: "Manage events",
            status: approved ? "Approved" : "Needs Review",
            aiRecommendation: "Approved",
            aiRationale: "Plausible request",
          },
        ],
        memberships:
          approved && !revoked
            ? [
                {
                  authUserID: "test-user",
                  orgID: 7,
                  Organization: { orgName: "Test Club" },
                },
              ]
            : [],
      },
    });
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/operator/access");
  await page.getByLabel("Verified organization").selectOption("7");
  await page.getByRole("button", { name: "Approve verified access" }).click();
  await expect(page.locator("#reviewStatus")).toContainText("Decision saved");
  await page
    .getByRole("button", { name: "Revoke organization access" })
    .click();
  await expect(page.locator("#reviewStatus")).toContainText(
    "assignment removed",
  );
  expect(approved && revoked).toBeTruthy();
});

for (const role of ["user", "organization_admin", "operator"]) {
  test(`settings exposes the correct tools for ${role}`, async ({ page }) => {
    const { account } = await fixture(page);
    account.role = role;
    account.admins = [
      { id: 7, name: "Outdoor Club" },
      { id: 8, name: "Music Club" },
    ];
    await page.goto("/settings");
    await expect(page.locator("#profileName")).toHaveText("Test Applicant");
    await expect(page.locator("#resetPassword")).toBeVisible();
    if (role === "organization_admin") {
      await expect(page.locator("#clubSettings")).toBeVisible();
      await expect(page.locator("#assignedClubs li")).toHaveText([
        "Outdoor Club",
        "Music Club",
      ]);
      await expect(
        page.getByRole("link", { name: "Club dashboard" }),
      ).toHaveAttribute("href", "/admin");
    } else {
      await expect(page.locator("#clubSettings")).toBeHidden();
      await expect(page.locator("#openAdmin")).toBeHidden();
    }
    if (role === "operator") {
      await expect(page.locator("#operatorSettings")).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Operator dashboard" }),
      ).toHaveAttribute("href", "/operator/access");
    } else {
      await expect(page.locator("#operatorSettings")).toBeHidden();
      await expect(page.locator("#openAccessReview")).toBeHidden();
    }
    await expect(
      page.locator('main a[href="/request-organization-access"]'),
    ).toHaveCount(0);
  });
}

test("operator can add an organization and select it without losing a review choice", async ({
  page,
}) => {
  const { account } = await fixture(page);
  account.role = "operator";
  account.organizations = [{ id: 7, name: "Test Club" }];
  let created = false;
  await page.route("**/api/operator/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/organizations")) {
      expect(route.request().postDataJSON()).toEqual({ name: "New Club" });
      return route
        .fulfill({
          json: {
            created: !created,
            organization: { id: 8, name: "New Club" },
          },
        })
        .then(() => {
          created = true;
        });
    }
    return route.fulfill({
      json: {
        requests: [
          {
            requestID: 1,
            firstName: "Test",
            lastName: "Applicant",
            email: "test@example.invalid",
            organization: "New Club",
            position: "Officer",
            reason: "Manage events",
            status: "Needs Review",
          },
        ],
        memberships: [],
      },
    });
  });
  await page.goto("/operator/access");
  const selection = page.getByLabel("Verified organization");
  await selection.selectOption("7");
  await page.getByLabel("Organization name", { exact: true }).fill("New Club");
  await page
    .getByRole("button", { name: "Add organization", exact: true })
    .click();
  await expect(page.locator("#organizationStatus")).toContainText(
    "Added New Club",
  );
  await expect(selection).toHaveValue("7");
  await selection.selectOption({ label: "New Club" });
  await expect(selection).toHaveValue("8");
  await page.getByLabel("Organization name", { exact: true }).fill("New Club");
  await page
    .getByRole("button", { name: "Add organization", exact: true })
    .click();
  await expect(page.locator("#organizationStatus")).toContainText(
    "already exists",
  );
  await expect(selection.locator('option[value="8"]')).toHaveCount(1);
});

test("access requests show quota and prevent a fourth submission", async ({
  page,
}) => {
  await fixture(page);
  let used = 2,
    submissions = 0;
  await page.route("**/api/organization-access-requests", (route) =>
    route.fulfill({ json: { remaining: 3 - used, limit: 3, requests: [] } }),
  );
  await page.route("**/api/organization-access-request", (route) => {
    used++;
    submissions++;
    return route.fulfill({
      status: 201,
      json: { status: "Needs Review", notificationSent: false },
    });
  });
  await page.goto("/request-organization-access");
  await expect(page.locator("#requestQuota")).toContainText("1 of 3");
  for (const [field, value] of Object.entries({
    organization: "Test Club",
    position: "Officer",
    reason: "Manage club events",
  }))
    await page.locator(`[name="${field}"]`).fill(value);
  await page.locator("#submitRequest").click();
  await expect(page.locator("#requestQuota")).toContainText(
    "Daily limit reached",
  );
  await expect(page.locator("#submitRequest")).toBeDisabled();
  await page.reload();
  await expect(page.locator("#submitRequest")).toBeDisabled();
  expect(submissions).toBe(1);
});

test("landing waits for session validation before showing account links", async ({
  page,
}) => {
  const { account } = await fixture(page);
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/state", async (route) => {
    await wait;
    await route.fulfill({ json: account });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Find your people. Make your plans." }),
  ).toBeVisible();
  const controls = page.locator(".cc-actions [data-landing-auth]");
  await expect(controls.first()).toBeHidden();
  release();
  await expect(controls.first()).toHaveText("Open Cougar Connect");
  await expect(controls.first()).toBeVisible();
  await expect(controls.last()).toHaveText("Your account");
});
