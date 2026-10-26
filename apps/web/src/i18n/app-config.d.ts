import type en from "../../messages/en.json";
import type { Locale } from "./routing";

// Message keys and locales are checked at compile time: a typo in a key or a
// missing translation namespace fails `tsc`, not the page in production.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof en;
  }
}
