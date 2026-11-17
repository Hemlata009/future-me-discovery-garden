import { useState } from "react";
import { Bot, Check, Droplets, Gamepad2, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { plantCare, gameMatches, robotPath, robotWalls } from "@/lib/demo-logic";

export function ProjectDemo({ theme }: { theme: string }) {
  const [moisture, setMoisture] = useState(48);
  const [genre, setGenre] = useState<keyof typeof gameMatches>("Adventure");
  const [match, setMatch] = useState<keyof typeof gameMatches | null>(null);
  const [position, setPosition] = useState(0);
  const care = plantCare(moisture);
  return (
    <div className="demo-panel">
      <div className="demo-top">
        <h2>Try the interactive demo</h2>
        <span className="demo-badge">Interactive sample</span>
      </div>
      <p className="demo-instruction">Tap to try it. It starts in its ready state below.</p>
      {theme === "farming" ? (
        <>
          <p>Plant-care simulator</p>
          <label className="slider-label" htmlFor="moisture">
            <span>Soil moisture</span>
            <strong>{moisture}%</strong>
          </label>
          <input
            id="moisture"
            type="range"
            min={0}
            max={100}
            value={moisture}
            onChange={(event) => setMoisture(Number(event.target.value))}
          />
          <div className="demo-output">
            <Droplets />
            <div>
              <strong>{care.title}</strong>
              <p>{care.detail}</p>
            </div>
          </div>
          <p className="mt-5">A simple rule-based simulation, not a real plant diagnosis.</p>
        </>
      ) : theme === "gaming" ? (
        <>
          <p>What's your kind of game?</p>
          <div className="filter-bar">
            {(Object.keys(gameMatches) as (keyof typeof gameMatches)[]).map((name) => (
              <Button
                variant="soft"
                className={genre === name ? "filter-active" : ""}
                key={name}
                aria-pressed={genre === name}
                onClick={() => {
                  setGenre(name);
                  setMatch(null);
                }}
              >
                {name}
              </Button>
            ))}
          </div>
          <Button variant="premium" onClick={() => setMatch(genre)}>
            <Gamepad2 />
            Find my game
          </Button>
          {match && (
            <div className="demo-output">
              <Gamepad2 />
              <div>
                <strong>{gameMatches[match].title}</strong>
                <p>{gameMatches[match].detail}</p>
              </div>
            </div>
          )}
          <p className="mt-5">
            Sample matches from a small curated collection, not AI predictions.
          </p>
        </>
      ) : (
        <>
          <p>One curious robot. One destination.</p>
          <div className="maze" aria-label="Robot navigation grid">
            {Array.from({ length: 25 }, (_, index) => (
              <div
                key={index}
                className={`maze-cell ${robotWalls.includes(index) ? "maze-wall" : ""} ${robotPath.slice(0, position + 1).includes(index) ? "maze-path" : ""}`}
              >
                {robotPath[position] === index ? (
                  <Bot size={22} />
                ) : index === 24 ? (
                  <Check size={20} className="text-mint" />
                ) : robotPath.slice(0, position).includes(index) ? (
                  "·"
                ) : (
                  ""
                )}
              </div>
            ))}
          </div>
          <div className="maze-controls">
            <Button
              variant="soft"
              size="icon"
              aria-label="Reset robot"
              onClick={() => setPosition(0)}
            >
              <RotateCcw />
            </Button>
            <Button
              variant="premium"
              disabled={position === robotPath.length - 1}
              onClick={() => setPosition(Math.min(position + 1, robotPath.length - 1))}
            >
              <Play />
              Next step
            </Button>
          </div>
          <div className="demo-output">
            <Bot />
            <div>
              <strong>
                {position === robotPath.length - 1
                  ? "Destination reached!"
                  : `Step ${position} of ${robotPath.length - 1}`}
              </strong>
              <p>
                {position === robotPath.length - 1
                  ? "Your robot found its way around every obstacle."
                  : "Following a precomputed obstacle-free path."}
              </p>
            </div>
          </div>
          <p className="mt-5">A rule-based path simulation, not AI.</p>
        </>
      )}
    </div>
  );
}
