import type { Browser, Page } from "@playwright/test";

/** A separate person: their own browser context, so their own name and token. */
export async function person(browser: Browser, options: Parameters<Browser["newContext"]>[0] = {}) {
  const context = await browser.newContext(options);
  return context.newPage();
}

export async function startRetro(page: Page, teamName: string) {
  await page.goto("/en");
  await page.getByLabel("Team name").first().fill(teamName);
  await page.getByRole("button", { name: "Start a retro" }).first().click();
  await page.waitForURL(/\/r\/[\w-]{10}$/);
}

export async function join(page: Page, name: string, url?: string) {
  if (url) await page.goto(url);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Join" }).click();
  await page.getByRole("region", { name: "Retro progress" }).waitFor();
}

/** A retro with a facilitator and one more participant, both joined. */
export async function retroWithTwo(browser: Browser, teamName: string) {
  const alice = await person(browser);
  const bob = await person(browser);
  await startRetro(alice, teamName);
  await join(alice, "Alice");
  await join(bob, "Bob", alice.url());
  return { alice, bob };
}

export async function postCard(page: Page, column: string, text: string) {
  const input = page.getByLabel(`Add a card to ${column}`);
  await input.fill(text);
  await input.press("Enter");
  await page.getByText(text).waitFor();
}

export async function goTo(facilitator: Page, ...steps: string[]) {
  for (const step of steps) await facilitator.getByRole("button", { name: step }).click();
}
