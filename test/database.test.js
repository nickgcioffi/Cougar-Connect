import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";

const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
const profile = {
  name: "Test Applicant",
  uni: "BYU",
  level: "Undergraduate",
  graduation: "2030-04",
  bio: "Test biography",
  photo: "https://example.invalid/avatar",
};

test("database migrations, RPC validation, persistence and RLS", async (t) => {
  const db = new PGlite();
  async function asUser(id, sql, params = []) {
    await db.exec("begin; set local role authenticated;");
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
        id,
      ]);
      const result = await db.query(sql, params);
      await db.exec("commit");
      return result;
    } catch (error) {
      await db.exec("rollback");
      throw error;
    }
  }
  const rpc = (id, name, payload) =>
    asUser(id, `select public.${name}($1::jsonb)`, [JSON.stringify(payload)]);
  try {
    await t.test(
      "applies all migrations in order over the documented base schema",
      async () => {
        await db.exec(
          await readFile(
            new URL("./fixtures/base-schema.sql", import.meta.url),
            "utf8",
          ),
        );
        for (const file of (
          await readdir(new URL("../database/", import.meta.url))
        )
          .filter((f) => f.endsWith(".sql"))
          .sort()) {
          await db.exec(
            await readFile(
              new URL("../database/" + file, import.meta.url),
              "utf8",
            ),
          );
        }
        assert.equal(
          (
            await db.query(
              "select column_name from information_schema.columns where table_name='User' and column_name='primaryInterest'",
            )
          ).rows.length,
          0,
        );
        await db.query("insert into auth.users values ($1),($2)", [alice, bob]);
        await db.exec(
          `insert into public."Organization"("orgName") values ('Test Club'),('Other Club');`,
        );
      },
    );
    await t.test(
      "profile fields persist across independent authenticated transactions",
      async () => {
        await rpc(alice, "save_profile", profile);
        await rpc(bob, "save_profile", { ...profile, name: "Other Person" });
        const { rows } = await asUser(alice, 'select * from public."User"');
        assert.equal(rows.length, 1);
        assert.equal(rows[0].firstName, "Test");
        assert.equal(rows[0].lastName, "Applicant");
        assert.equal(rows[0].biography, profile.bio);
        assert.equal(rows[0].photoURL, profile.photo);
        assert.equal(rows[0].uniName, profile.uni);
        assert.equal(rows[0].studyLevel, profile.level);
        assert.equal(
          new Date(rows[0].gradDate).toISOString().slice(0, 10),
          "2030-04-01",
        );
        assert.equal(rows[0].authUserID, alice);
      },
    );
    await t.test(
      "invalid profile inputs roll back without corrupting a saved profile",
      async () => {
        for (const patch of [
          { name: "" },
          { name: "x".repeat(81) },
          { level: "Invalid" },
          { bio: "x".repeat(401) },
          { graduation: "bad-date" },
        ])
          await assert.rejects(
            rpc(alice, "save_profile", { ...profile, ...patch }),
          );
        assert.equal(
          (await asUser(alice, 'select "firstName" from public."User"')).rows[0]
            .firstName,
          "Test",
        );
      },
    );
    await t.test(
      "direct writes and anonymous RPC execution are denied",
      async () => {
        await assert.rejects(
          asUser(alice, `update public."User" set "firstName"='Forged'`),
        );
        await db.exec("begin; set local role anon;");
        try {
          await assert.rejects(
            db.query("select public.save_profile($1::jsonb)", [
              JSON.stringify(profile),
            ]),
          );
        } finally {
          await db.exec("rollback");
        }
      },
    );
    await t.test(
      "interest and saved-event rows are private to their account",
      async () => {
        await rpc(alice, "save_interests", [
          "Technology",
          "Service",
          "Research",
        ]);
        await assert.rejects(rpc(bob, "save_interests", ["Technology"]));
        assert.equal(
          (await asUser(alice, 'select * from public."User Interests"')).rows
            .length,
          3,
        );
        assert.equal(
          (await asUser(bob, 'select * from public."User Interests"')).rows
            .length,
          0,
        );
        await db.exec(
          `insert into public."Events"(name,date,time,"orgID") values ('Test event','2035-01-01','18:00',1)`,
        );
        await rpc(alice, "save_event", { id: 1, saved: true });
        assert.equal(
          (await asUser(alice, 'select * from public."UserEvents"')).rows
            .length,
          1,
        );
        assert.equal(
          (await asUser(bob, 'select * from public."UserEvents"')).rows.length,
          0,
        );
        await rpc(alice, "save_event", { id: 1, saved: false });
        assert.equal(
          (await asUser(alice, 'select * from public."UserEvents"')).rows[0]
            .isSaved,
          false,
        );
      },
    );
    await t.test("photo policies isolate user upload paths", async () => {
      await asUser(
        alice,
        `insert into storage.objects(bucket_id,name) values ('profile-photos',$1)`,
        [alice + "/avatar"],
      );
      await assert.rejects(
        asUser(
          bob,
          `insert into storage.objects(bucket_id,name) values ('profile-photos',$1)`,
          [alice + "/forged"],
        ),
      );
      assert.equal(
        (await asUser(bob, "select * from storage.objects")).rows.length,
        0,
      );
    });
    await db.exec(
      `update public."User" set role='organization_admin' where "authUserID"='${alice}'`,
    );
    const event = {
      name: "Meeting",
      location: "Campus",
      desc: "Details",
      type: "Social",
      date: "2035-01-01",
      time: "18:00",
      genre: "Technology",
      orgID: 1,
    };
    await t.test(
      "event RPCs reject malformed fields and invalid references",
      async () => {
        for (const patch of [
          { name: "" },
          { location: "" },
          { desc: "" },
          { type: "Unknown" },
          { date: "2000-01-01" },
          { genre: "Unknown" },
          { orgID: 999 },
        ])
          await assert.rejects(
            rpc(alice, "create_event", { ...event, ...patch }),
          );
      },
    );
    await t.test(
      "organization membership scopes administration to assigned organizations",
      async () => {
        await db.query(
          'insert into public."Organization Admins" values ($1,1)',
          [alice],
        );
        assert.equal(
          (await asUser(alice, "select public.administers(1) as allowed"))
            .rows[0].allowed,
          true,
        );
        assert.equal(
          (await asUser(bob, "select public.administers(1) as allowed")).rows[0]
            .allowed,
          false,
        );
        assert.equal(
          (await asUser(bob, 'select * from public."Organization Admins"')).rows
            .length,
          0,
        );
      },
    );
    // These assertions execute and document the temporary open-mutation policy.
    // Roll back each probe so a missing permission check cannot change later fixtures.
    async function probe(id, name, payload) {
      await db.exec("begin; set local role authenticated;");
      try {
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
          id,
        ]);
        return await db.query(`select public.${name}($1::jsonb)`, [
          JSON.stringify(payload),
        ]);
      } finally {
        await db.exec("rollback");
      }
    }
    for (const [name, id, rpcName, payload] of [
      [
        "ordinary users cannot create organization events",
        bob,
        "create_event",
        event,
      ],
      [
        "ordinary users cannot cancel organization events",
        bob,
        "cancel_event",
        { id: 1 },
      ],
      [
        "admins cannot create events for an unassigned organization",
        alice,
        "create_event",
        { ...event, orgID: 2 },
      ],
    ]) {
      await t.test(name, async () => {
        await assert.rejects(probe(id, rpcName, payload));
      });
    }
    await db.exec(
      `insert into public."Events"(name,date,time,"orgID") values ('Other event','2035-01-01','18:00',2)`,
    );
    const otherEvent = (
      await db.query(
        `select "eventID" from public."Events" where name='Other event'`,
      )
    ).rows[0].eventID;
    await t.test(
      "admins cannot cancel events for an unassigned organization",
      async () => {
        await assert.rejects(probe(alice, "cancel_event", { id: otherEvent }));
      },
    );
    await t.test(
      "assigned admins can create and cancel their own organization events",
      async () => {
        await rpc(alice, "create_event", event);
        const ownEvent = (
          await db.query(
            `select "eventID" from public."Events" where name='Meeting'`,
          )
        ).rows[0].eventID;
        await rpc(alice, "cancel_event", { id: ownEvent });
        assert.equal(
          (
            await db.query('select * from public."Events" where "eventID"=$1', [
              ownEvent,
            ])
          ).rows.length,
          0,
        );
      },
    );
    await t.test(
      "SQL search respects authentication, case-insensitive matching and empty terms",
      async () => {
        assert.ok(
          (
            await asUser(alice, "select * from public.search_events('TEST')")
          ).rows.some((row) => row.name === "Test event"),
        );
        assert.equal(
          (await asUser(alice, "select * from public.search_events(' ')")).rows
            .length,
          0,
        );
      },
    );
    await t.test(
      "operator decisions atomically grant scoped access and revocation removes it",
      async () => {
        const operatorID = "00000000-0000-4000-8000-000000000003";
        await db.query("insert into auth.users values ($1)", [operatorID]);
        await rpc(operatorID, "save_profile", {
          ...profile,
          name: "Site Operator",
        });
        await db.query(
          `update public."User" set role='operator' where "authUserID"=$1`,
          [operatorID],
        );
        await assert.rejects(
          asUser(bob, "select public.create_organization('New Club')"),
        );
        await assert.rejects(
          asUser(operatorID, "select public.create_organization('   ')"),
        );
        const created = (
          await asUser(
            operatorID,
            "select public.create_organization($1) as result",
            ["  New   Club  "],
          )
        ).rows[0].result;
        assert.equal(created.created, true);
        assert.equal(created.organization.name, "New Club");
        const duplicate = (
          await asUser(
            operatorID,
            "select public.create_organization('new club') as result",
          )
        ).rows[0].result;
        assert.equal(duplicate.created, false);
        assert.equal(duplicate.organization.id, created.organization.id);
        assert.equal(
          (
            await asUser(bob, "select public.administers($1) as allowed", [
              created.organization.id,
            ])
          ).rows[0].allowed,
          false,
        );
        const inserted = await db.query(
          `insert into public."Organization Access Requests"("authUserID","firstName","lastName",email,organization,position,reason,status) values ($1,'Other','Person','test@example.invalid','Test Club','Officer','Manage events','Needs Review') returning "requestID"`,
          [bob],
        );
        const rid = inserted.rows[0].requestID;
        assert.equal(
          (
            await asUser(
              alice,
              'select * from public."Organization Access Requests"',
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await asUser(
              bob,
              'select * from public."Organization Access Requests"',
            )
          ).rows.length,
          1,
        );
        await assert.rejects(
          asUser(
            alice,
            "select public.decide_access_request($1,'Approved',1)",
            [rid],
          ),
        );
        await assert.rejects(
          asUser(
            operatorID,
            "select public.decide_access_request($1,'Approved',99999)",
            [rid],
          ),
        );
        assert.equal(
          (
            await db.query(
              'select status from public."Organization Access Requests" where "requestID"=$1',
              [rid],
            )
          ).rows[0].status,
          "Needs Review",
        );
        await asUser(
          operatorID,
          "select public.decide_access_request($1,'Approved',1)",
          [rid],
        );
        assert.equal(
          (await asUser(bob, 'select role from public."User"')).rows[0].role,
          "organization_admin",
        );
        assert.equal(
          (await asUser(bob, "select public.administers(1) as allowed")).rows[0]
            .allowed,
          true,
        );
        assert.equal(
          (await asUser(bob, "select public.administers(2) as allowed")).rows[0]
            .allowed,
          false,
        );
        await assert.rejects(
          asUser(
            operatorID,
            "select public.decide_access_request($1,'Rejected',null)",
            [rid],
          ),
        );
        await assert.rejects(
          asUser(bob, "select public.revoke_organization_access($1,1)", [
            alice,
          ]),
        );
        await asUser(
          operatorID,
          "select public.revoke_organization_access($1,1)",
          [bob],
        );
        assert.equal(
          (await asUser(bob, 'select role from public."User"')).rows[0].role,
          "user",
        );
        assert.equal(
          (await asUser(bob, "select public.administers(1) as allowed")).rows[0]
            .allowed,
          false,
        );
        await asUser(
          operatorID,
          "select public.revoke_organization_access($1,1)",
          [operatorID],
        );
        assert.equal(
          (await asUser(operatorID, 'select role from public."User"')).rows[0]
            .role,
          "operator",
        );
      },
    );
    await t.test(
      "daily request quota permits three, counts all outcomes, and resets by Mountain date",
      async () => {
        const payload = {
          firstName: "Test",
          lastName: "Applicant",
          email: "test@example.invalid",
          organization: "Test Club",
          position: "Officer",
          reason: "Manage events",
        };
        const submit = async (id) => {
          await db.exec("begin; set local role service_role;");
          try {
            const result = await db.query(
              "select public.submit_access_request($1,$2::jsonb) as result",
              [id, JSON.stringify(payload)],
            );
            await db.exec("commit");
            return result.rows[0].result;
          } catch (error) {
            await db.exec("rollback");
            throw error;
          }
        };
        await assert.rejects(
          asUser(alice, "select public.submit_access_request($1,$2::jsonb)", [
            alice,
            JSON.stringify(payload),
          ]),
        );
        for (let i = 0; i < 3; i++) {
          const r = await submit(alice);
          assert.equal(r.remaining, 2 - i);
        }
        await db.query(
          `update public."Organization Access Requests" set status='Rejected' where "authUserID"=$1`,
          [alice],
        );
        await assert.rejects(submit(alice), (error) => error.code === "P0429");
        assert.equal(
          (
            await db.query(
              'select count(*)::int as count from public."Organization Access Requests" where "authUserID"=$1',
              [alice],
            )
          ).rows[0].count,
          3,
        );
        // Earlier Mountain dates do not consume today's quota; no rolling 24-hour window.
        await db.query(
          `update public."Organization Access Requests" set "createdAt"=(date_trunc('day',now() at time zone 'America/Denver') at time zone 'America/Denver')-interval '1 second' where "authUserID"=$1`,
          [alice],
        );
        assert.equal((await submit(alice)).remaining, 2);
        assert.ok((await submit(bob)).requestID);
      },
    );
    await t.test(
      "account purge requires the service role and preserves other accounts",
      async () => {
        await assert.rejects(
          asUser(alice, "select public.purge_account_data($1)", [bob]),
        );
        await db.exec("begin; set local role service_role;");
        try {
          await db.query("select public.purge_account_data($1)", [alice]);
          await db.exec("commit");
        } catch (error) {
          await db.exec("rollback");
          throw error;
        }
        assert.equal(
          (await asUser(alice, 'select * from public."User"')).rows.length,
          0,
        );
        assert.equal(
          (await asUser(bob, 'select * from public."User"')).rows.length,
          1,
        );
      },
    );
    await t.test(
      "a failed migration rolls back and can be recovered",
      async () => {
        await assert.rejects(
          db.exec(
            "begin; create table public.failed_release(id int); select missing_function(); commit;",
          ),
        );
        await db.exec("rollback");
        assert.equal(
          (
            await db.query(
              "select to_regclass('public.failed_release') as name",
            )
          ).rows[0].name,
          null,
        );
        await db.exec(
          "begin; create table public.recovered_release(id int); commit;",
        );
      },
    );
  } finally {
    await db.close();
  }
});
