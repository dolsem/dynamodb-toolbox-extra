import { describe, expect, it } from "vitest";

describe("dummy test", () => {
  describe("sub test 1", () => {
    describe("sub test 2", () => {
      it("passes", () => {
        expect(true).toEqual(true);
      });
    });
  });
});
