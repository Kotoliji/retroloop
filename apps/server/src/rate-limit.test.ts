import { describe, expect, it } from "vitest";
import { TokenBucket } from "./rate-limit";

describe("TokenBucket", () => {
  it("allows a burst, then refills over time", () => {
    let now = 0;
    const bucket = new TokenBucket(3, 2, () => now);
    expect([bucket.take(), bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, true, false]);

    now = 500; // half a second at 2 per second = 1 token
    expect([bucket.take(), bucket.take()]).toEqual([true, false]);

    now = 60_000; // never refills past capacity
    expect([bucket.take(), bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, true, false]);
  });
});
