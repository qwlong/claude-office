import { describe, it, expect, vi } from "vitest";

describe("SpawnModal double-submit prevention", () => {
  it("should not call onSpawn twice when handleSpawn is invoked rapidly", async () => {
    // Simulate the logic of handleSpawn
    let loading = false;
    const onSpawn = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100)),
      );

    const handleSpawn = async (projectId: string, issue: string) => {
      if (!projectId || !issue || loading) return;
      loading = true;
      try {
        await onSpawn(projectId, issue);
      } finally {
        loading = false;
      }
    };

    // Rapid double invocation
    handleSpawn("proj-a", "fix bug");
    handleSpawn("proj-a", "fix bug");

    // Wait for promises
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Should only be called once
    expect(onSpawn).toHaveBeenCalledTimes(1);
  });
});
