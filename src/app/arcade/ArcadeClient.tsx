"use client";

import { useCallback, useState } from "react";
import GameHost from "./tower-defense/GameHost";

type GameResult = {
  score: number;
  waveReached: number;
  enemiesDefeated: number;
  powerupsUsed: number;
};

export default function ArcadeClient() {
  const [lastResult, setLastResult] = useState<GameResult | null>(null);

  const handleGameOver = useCallback((result: GameResult) => {
    setLastResult(result);
  }, []);

  return (
    <main className="arcadeShell">
      <section className="arcadeHeader">
        <p className="arcadeEyebrow">TaskLaunch Arcade</p>
        <h1>Focus Defender</h1>
        <p>
          Defend your focus zone from waves of distractions. Daily XP gives you
          extra powerup tokens for each run.
        </p>
      </section>

      <section className="arcadeLayout">
        <div className="arcadeGamePanel">
          <GameHost
            dailyXp={420}
            powerupTokens={3}
            userId="local-test-user"
            onGameOver={handleGameOver}
          />
        </div>

        <aside className="arcadeSidePanel">
          <h2>Run Stats</h2>

          {lastResult ? (
            <div className="arcadeStats">
              <p>Score: {lastResult.score}</p>
              <p>Wave: {lastResult.waveReached}</p>
              <p>Enemies defeated: {lastResult.enemiesDefeated}</p>
              <p>Powerups used: {lastResult.powerupsUsed}</p>
            </div>
          ) : (
            <p>No completed run yet.</p>
          )}
        </aside>
      </section>
    </main>
  );
}