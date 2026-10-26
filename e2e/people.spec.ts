import { expect, test } from "@playwright/test";
import { goTo, person, postCard, retroWithTwo, startRetro } from "./helpers";

test("joining by link, coming back as yourself and leaving", async ({ browser }) => {
  const { alice, bob } = await retroWithTwo(browser, "People team");
  await expect(alice.getByRole("list", { name: "2 online" })).toBeVisible();

  await postCard(alice, "Went well", "Code reviews were fast");
  await alice.reload();
  await expect(alice.getByRole("listitem").filter({ hasText: "Code reviews were fast" })).toContainText("Your card");
  await expect(alice.getByRole("list", { name: "2 online" })).toBeVisible();

  await bob.close();
  await expect(alice.getByRole("list", { name: "1 online" })).toBeVisible();
});

test("a Ukrainian browser gets Ukrainian, and switching language keeps the retro", async ({ browser }) => {
  const olena = await person(browser, { locale: "uk-UA" });
  await olena.goto("/");
  await expect(olena).toHaveURL(/\/uk$/);
  await olena.getByLabel("Назва команди").first().fill("Команда");
  await olena.getByRole("button", { name: "Почати ретро" }).first().click();
  await olena.waitForURL(/\/uk\/r\//);
  await olena.getByLabel("Ваше ім'я — так його бачитиме команда").fill("Олена");
  await olena.getByRole("button", { name: "Приєднатися" }).click();
  await expect(olena.getByText("Пишіть картки.", { exact: false })).toBeVisible();

  const sam = await person(browser);
  await sam.goto(olena.url());
  await sam.getByLabel("Ваше ім'я — так його бачитиме команда").fill("Sam");
  await sam.getByRole("button", { name: "Приєднатися" }).click();
  await sam.getByLabel("Мова").selectOption("en");
  await expect(sam).toHaveURL(/\/en\/r\//);
  await expect(sam.getByText("Write your cards.", { exact: false })).toBeVisible();
  await expect(olena.getByRole("list", { name: "2 онлайн" })).toBeVisible(); // still Sam, not a third person
});

test("the facilitator can change the format until the first card", async ({ browser }) => {
  const { alice, bob } = await retroWithTwo(browser, "Format team");
  await alice.getByLabel("Format").selectOption("four-ls");
  for (const column of ["Liked", "Learned", "Lacked", "Longed for"]) {
    await expect(bob.getByRole("heading", { name: column })).toBeVisible();
  }
  await postCard(bob, "Learned", "How to profile the API");
  await expect(alice.getByLabel("Format")).toHaveCount(0);
});

test("the survey, and deleting a retro for everyone", async ({ browser }) => {
  const { alice, bob } = await retroWithTwo(browser, "Survey team");
  await goTo(alice, "Reveal cards", "Start voting", "Show results", "Wrap up");

  await bob.getByText("Very useful").click();
  await bob.getByLabel("Anything we should improve", { exact: false }).fill("The timer is great");
  await bob.getByLabel("You may quote this", { exact: false }).check();
  await bob.getByRole("button", { name: "Send" }).click();
  await expect(bob.getByText("Thank you", { exact: false })).toBeVisible();
  await bob.reload();
  await expect(bob.getByRole("radio", { name: /5/ })).toBeChecked();

  await expect(bob.getByRole("button", { name: "Delete retro" })).toHaveCount(0);
  alice.once("dialog", (dialog) => dialog.accept());
  await alice.getByRole("button", { name: "Delete retro" }).click();
  await expect(bob.getByRole("heading", { name: "This retro was deleted" })).toBeVisible();
});

test("an unknown retro link says so", async ({ browser }) => {
  const page = await person(browser);
  await page.goto("/en/r/nope000000");
  // The name form comes first; joining then reports that the retro is missing.
  await page.getByLabel("Your name").fill("Sam");
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByRole("heading", { name: "This retro does not exist" })).toBeVisible();
});

test("the landing page links to the privacy page", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByRole("heading", { name: "Privacy", level: 1 })).toBeVisible();
  await startRetro(page, "From privacy");
});
