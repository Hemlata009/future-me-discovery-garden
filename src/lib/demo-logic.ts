export function plantCare(moisture: number) {
  return moisture < 35
    ? {
        title: "Your plant could use a drink",
        detail: "The soil is dry. Add a little water and check again after it drains.",
      }
    : moisture > 75
      ? {
          title: "Let the soil breathe",
          detail: "The soil is very wet. Pause watering and make sure the pot can drain.",
        }
      : {
          title: "Looking green and healthy",
          detail: "Soil moisture is in a comfortable range. No watering needed right now.",
        };
}
export const gameMatches = {
  Adventure: {
    title: "Minecraft",
    detail: "A world of creativity and discovery, with a new adventure around every corner.",
  },
  Strategy: {
    title: "Civilization VI",
    detail: "Plan ahead, build your civilization, and make every decision count.",
  },
  Racing: {
    title: "Forza Horizon 5",
    detail: "Explore an open world of colorful roads, fast cars, and friendly competition.",
  },
};
export const robotPath = [0, 5, 10, 11, 12, 17, 22, 23, 24];
export const robotWalls = [1, 3, 6, 8, 13, 15, 18, 20, 21];
