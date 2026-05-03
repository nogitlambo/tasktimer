"use client";

import { useEffect, useRef } from "react";
import type { TowerDefenseResult } from "./types";

type GameHostProps = {
  dailyXp: number;
  powerupTokens: number;
  userId: string;
  onGameOver: (result: TowerDefenseResult) => void;
};

export default function GameHost({
  dailyXp,
  powerupTokens,
  userId,
  onGameOver,
}: GameHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    let game: { destroy: (removeCanvas: boolean, noReturn?: boolean) => void } | null = null;

    void import("./createGame").then(({ createTowerDefenseGame }) => {
      if (disposed || !containerRef.current) return;
      game = createTowerDefenseGame({
        parent: containerRef.current,
        dailyXp,
        powerupTokens,
        userId,
        onGameOver,
      });
    });

    return () => {
      disposed = true;
      game?.destroy(true);
    };
  }, [dailyXp, powerupTokens, userId, onGameOver]);

  return <div ref={containerRef} className="towerDefenseGameHost" />;
}
