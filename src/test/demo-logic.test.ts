import { describe, expect, it } from "vitest";
import { plantCare, gameMatches, robotPath, robotWalls } from "@/lib/demo-logic";
describe("Interactive sample projects", () => {
  it("changes plant advice with the soil reading", () => {
    expect(plantCare(10).title).toBe("Your plant could use a drink");
    expect(plantCare(48).title).toBe("Looking green and healthy");
    expect(plantCare(90).title).toBe("Let the soil breathe");
  });
  it("matches different game genres to different sample games", () => {
    expect(gameMatches.Adventure.title).toBe("Minecraft");
    expect(gameMatches.Strategy.title).toBe("Civilization VI");
    expect(gameMatches.Racing.title).toBe("Forza Horizon 5");
  });
  it("provides a contiguous robot path that never crosses a wall", () => {
    expect(robotPath[0]).toBe(0);
    expect(robotPath.at(-1)).toBe(24);
    robotPath.forEach((b, i) => {
      expect(robotWalls.includes(b)).toBe(false);
      const a = robotPath[i - 1];
      if (a !== undefined)
        expect(Math.abs(Math.floor(a / 5) - Math.floor(b / 5)) + Math.abs((a % 5) - (b % 5))).toBe(
          1,
        );
    });
  });
});
