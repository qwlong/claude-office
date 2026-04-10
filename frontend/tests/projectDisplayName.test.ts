import { describe, it, expect } from "vitest";
import { getProjectDisplayName } from "@/types/projects";

describe("getProjectDisplayName", () => {
  it("uses last directory segment from root", () => {
    expect(
      getProjectDisplayName({
        name: "Projects-workstream-repos-workstream-workerhub",
        root: "/Users/apple/Projects/workstream/repos/workstream-workerhub",
      }),
    ).toBe("workstream-workerhub");
  });

  it("strips Projects- prefix when root is null", () => {
    expect(
      getProjectDisplayName({
        name: "Projects-others-random",
        root: null,
      }),
    ).toBe("others-random");
  });

  it("returns full name when no prefix and no root", () => {
    expect(
      getProjectDisplayName({ name: "my-project", root: null }),
    ).toBe("my-project");
  });

  it("handles trailing slash in root", () => {
    expect(
      getProjectDisplayName({ name: "x", root: "/foo/bar/" }),
    ).toBe("bar");
  });

  it("same root produces same display name (no dedup)", () => {
    const a = getProjectDisplayName({ name: "A", root: "/a/sameName" });
    const b = getProjectDisplayName({ name: "B", root: "/b/sameName" });
    expect(a).toBe("sameName");
    expect(b).toBe("sameName");
  });
});
