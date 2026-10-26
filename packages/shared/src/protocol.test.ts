import { describe, expect, it } from "vitest";
import { estimateClockOffset, serverHelloSchema } from "./protocol";

describe("estimateClockOffset", () => {
  it("is zero when both clocks agree", () => {
    // sent at 1000, server answered at 1050, reply arrived at 1100
    expect(estimateClockOffset(1000, 1100, 1050)).toEqual({ roundTrip: 100, offset: 0 });
  });

  it("is positive when the server clock is ahead", () => {
    expect(estimateClockOffset(1000, 1100, 6050).offset).toBe(5000);
  });
});

describe("serverHelloSchema", () => {
  it("rejects a payload without serverTime", () => {
    expect(serverHelloSchema.safeParse({ protocolVersion: 1 }).success).toBe(false);
  });
});
