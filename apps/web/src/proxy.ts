import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const i18n = createMiddleware(routing);

/** Sends visitors without a locale in the URL to their language's pages. */
export function proxy(request: NextRequest) {
  return i18n(request);
}

export const config = {
  // Everything except Next internals and files with an extension.
  matcher: "/((?!_next|_vercel|.*\..*).*)",
};
