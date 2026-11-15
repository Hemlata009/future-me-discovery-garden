import farmingImage from "@/assets/farming.jpg";
import gamingImage from "@/assets/gaming.jpg";
import robotImage from "@/assets/robot.jpg";

export const projects = [
  {
    id: "farming",
    title: "AI Farming Assistant",
    category: "Nature & sustainability",
    image: farmingImage,
    tone: "mint",
    icon: "leaf",
    description:
      "Help plants thrive with a smart assistant that knows when they need a little care.",
    technologies: ["Python", "Machine Learning", "IoT"],
    goal: "A healthier planet, one plant at a time.",
    roadmap: [
      "Meet your plants",
      "Collect soil and weather readings",
      "Build a plant-care decision model",
      "Connect your dashboard and test it",
    ],
    author: "Aarav",
    initials: "AK",
  },
  {
    id: "gaming",
    title: "Smart Gaming Recommender",
    category: "Gaming & entertainment",
    image: gamingImage,
    tone: "violet",
    icon: "gamepad",
    description:
      "Turn your love of gaming into a personalized recommender that finds everyone's next favorite game.",
    technologies: ["Python", "Recommendation Systems", "React"],
    goal: "Great games. A perfect match.",
    roadmap: [
      "Discover what makes a great game",
      "Build a small game collection",
      "Match player preferences to games",
      "Create and test your recommendation screen",
    ],
    author: "Diya",
    initials: "DS",
  },
  {
    id: "robotics",
    title: "Robot Navigation Simulator",
    category: "Robotics & innovation",
    image: robotImage,
    tone: "blue",
    icon: "bot",
    description:
      "Give a curious little robot a sense of direction. Build a simulator that helps it find its way home.",
    technologies: ["Python", "Robotics", "Pathfinding"],
    goal: "Small robot. Big possibilities.",
    roadmap: [
      "Create your robot's world",
      "Map obstacles and destinations",
      "Explore a pathfinding algorithm",
      "Simulate, test, and improve navigation",
    ],
    author: "Rohan",
    initials: "RP",
  },
] as const;

export type Project = (typeof projects)[number];
export function getProject(theme?: string): Project {
  return projects.find((project) => project.id === theme) ?? projects[0];
}

export function pageHead(title: string, description: string) {
  return {
    meta: [
      { title: `${title} | FutureMe AI` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} | FutureMe AI` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  };
}
