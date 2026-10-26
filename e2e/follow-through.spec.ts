import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { goTo, postCard, retroWithTwo } from "./helpers";

async function addAction(page: Page, text: string, owner: string) {
  const panel = page.getByRole("complementary");
  await panel.getByPlaceholder("What exactly will be done?").fill(text);
  await panel.getByLabel("Owner").fill(owner);
  await panel.getByRole("button", { name: "Add action item" }).click();
  await expect(panel.getByText(text)).toBeVisible();
}

test("action items carry into the team's next retro and get reviewed", async ({ browser }) => {
  const { alice, bob } = await retroWithTwo(browser, "Follow-through team");

  await test.step("up to three owned, dated action items are agreed while discussing", async () => {
    await postCard(bob, "To improve", "Flaky end-to-end tests");
    await goTo(alice, "Reveal cards", "Start voting", "Show results");
    await bob
      .getByRole("listitem")
      .filter({ hasText: "Flaky end-to-end tests" })
      .getByRole("button", { name: "+ Action" })
      .click();
    await expect(bob.getByText("From topic:")).toBeVisible();
    await addAction(bob, "Quarantine the 5 flakiest tests", "Bob");
    await addAction(alice, "Automate the release checklist", "Alice");
    await addAction(alice, "Write the on-call runbook", "Carol");
    await expect(alice.getByText("That's the limit for this retro.")).toBeVisible();
  });

  await test.step("the wrap-up exports what was agreed", async () => {
    await goTo(alice, "Wrap up");
    await expect(bob.getByRole("heading", { name: "What Follow-through team agreed to do" })).toBeVisible();
    const [csv] = await Promise.all([
      alice.waitForEvent("download"),
      alice.getByRole("button", { name: "Download CSV for Jira" }).click(),
    ]);
    const rows = (await readFile((await csv.path())!, "utf8")).trim().split("\r\n");
    expect(rows).toHaveLength(4);
    expect(rows[1]).toContain('"Quarantine the 5 flakiest tests"');

    const [ics] = await Promise.all([
      alice.waitForEvent("download"),
      alice.getByRole("button", { name: 'Add "Write the on-call runbook" to calendar' }).click(),
    ]);
    expect(await readFile((await ics.path())!, "utf8")).toContain("SUMMARY:Due: Write the on-call runbook");
  });

  await test.step("the next retro opens with a review of those items", async () => {
    await alice.getByRole("button", { name: "Start the next retro" }).click();
    await expect(alice.getByRole("heading", { name: /Follow-through team · Retro 2/ })).toBeVisible();
    await bob.getByRole("link", { name: "Join the next retro" }).click();
    await expect(bob.getByText("First, the action items from last time")).toBeVisible();

    const outcome = (page: Page, item: string) => page.getByRole("group", { name: `Outcome of ${item}` });
    await outcome(bob, "Quarantine the 5 flakiest tests").getByRole("button", { name: "Done" }).click();
    await outcome(alice, "Write the on-call runbook").getByRole("button", { name: "Drop it" }).click();
    await outcome(alice, "Automate the release checklist").getByRole("button", { name: "Not yet" }).click();
    await expect(
      outcome(bob, "Write the on-call runbook").getByRole("button", { name: "Drop it", pressed: true }),
    ).toBeVisible();
    await expect(bob.getByText("1 of 3 action items from earlier retros done")).toBeVisible();
  });
});
