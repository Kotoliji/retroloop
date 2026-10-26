import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/**
 * False in the server HTML and until React takes over the page. Submit buttons
 * wait for it: a click before hydration would do a plain form submit and
 * reload the page, while typing early is fine because inputs are read on submit.
 */
export function useHydrated() {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}
