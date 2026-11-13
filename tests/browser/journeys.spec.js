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
    if (url.pathname === "/api/organization-access-request")
      return route.fulfill({
        status: 201,
        json: { ok: true, status: "Pended", notificationSent: true },
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
    firstName: "Test",
    lastName: "Applicant",
    email: "test@example.invalid",
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

test("mobile landing header keeps menu beside brand at phone widths", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/views/mobile/index.html");
  const brand = await page.locator(".landing-header .brand").boundingBox();
  const menu = await page.locator(".feature-menu summary").boundingBox();
  expect(
    Math.abs(brand.y + brand.height / 2 - (menu.y + menu.height / 2)),
  ).toBeLessThan(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
