import { expect, test } from "@playwright/test";
import { goTo, postCard, retroWithTwo } from "./helpers";

test("a whole retro, from anonymous writing to the discussion", async ({ browser }) => {
  const { alice, bob } = await retroWithTwo(browser, "Flow team");

  await test.step("only the facilitator runs the retro", async () => {
    await expect(bob.getByLabel("facilitator")).toBeVisible();
    await expect(bob.getByRole("button", { name: "Reveal cards" })).toHaveCount(0);
  });

  await test.step("while writing, other people's text never reaches the browser", async () => {
    await postCard(alice, "To improve", "Deploys broke twice");
    await postCard(bob, "To improve", "CI is slow");
    await postCard(bob, "Went well", "Waiting for builds got shorter");
    await expect(bob.getByLabel("A hidden card from a teammate")).toBeVisible();
    await expect(bob.getByText("Deploys broke twice")).toHaveCount(0);
    expect(await bob.content()).not.toContain("Deploys broke twice");
  });

  await test.step("revealing shows every card to everyone", async () => {
    await goTo(alice, "Reveal cards");
    await expect(bob.getByText("Deploys broke twice")).toBeVisible();
  });

  await test.step("dragging a card onto a similar one groups them for everyone", async () => {
    const from = (await bob.getByText("Waiting for builds got shorter").boundingBox())!;
    const to = (await bob.getByText("CI is slow").boundingBox())!;
    await bob.mouse.move(from.x + 20, from.y + 8);
    await bob.mouse.down();
    await bob.mouse.move(from.x + 40, from.y + 20, { steps: 5 });
    await bob.mouse.move(to.x + 20, to.y + 8, { steps: 15 });
    await bob.mouse.up();
    await expect(
      alice.getByRole("list", { name: "Grouped cards" }).getByText("Waiting for builds got shorter"),
    ).toBeVisible();
  });

  await test.step("votes are limited and stay private until the results", async () => {
    await goTo(alice, "3 min", "Start voting");
    await expect(bob.getByRole("timer")).toBeVisible();
    await bob.getByRole("button", { name: "Vote for CI is slow" }).click();
    await bob.getByRole("button", { name: "Vote for CI is slow" }).click();
    await bob.getByRole("button", { name: "Vote for Deploys broke twice" }).click();
    await expect(bob.getByText("0 of 3 votes left")).toBeVisible();
    await expect(bob.getByRole("button", { name: "Vote for Deploys broke twice" })).toBeDisabled();
    await alice.getByRole("button", { name: "Vote for CI is slow" }).click();
  });

  await test.step("results rank topics by votes; the facilitator picks one", async () => {
    await goTo(alice, "Show results");
    const topics = bob.getByRole("region", { name: "Topics" }).locator("ol > li");
    await expect(topics.first()).toContainText("CI is slow");
    await expect(topics.first()).toContainText("3");
    await alice.getByRole("button", { name: "Discuss" }).first().click();
    await expect(topics.first()).toHaveAttribute("aria-current", "true");
  });
});
