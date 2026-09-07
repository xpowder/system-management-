import { describe, expect, it } from "vitest";
import { readPageMeta } from "./gymApi";

describe("readPageMeta", () => {
  it("reads backend pagination headers", () => {
    const headers = new Headers({
      "X-Total-Count": "1000",
      "X-Limit": "40",
      "X-Offset": "40",
      "X-Has-More": "true",
    });
    expect(readPageMeta(headers, 40)).toEqual({
      total: 1000,
      limit: 40,
      offset: 40,
      hasMore: true,
    });
  });

  it("treats the last page as complete", () => {
    const headers = new Headers({
      "X-Total-Count": "45",
      "X-Limit": "40",
      "X-Offset": "40",
      "X-Has-More": "false",
    });
    expect(readPageMeta(headers, 5).hasMore).toBe(false);
  });
});
