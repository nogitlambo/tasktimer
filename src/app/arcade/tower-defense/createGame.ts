import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { PreloadScene } from "./scenes/PreloadScene";
import { GameScene } from "./scenes/GameScene";
import { GameOverScene } from "./scenes/GameOverScene";
import type { CreateTowerDefenseGameOptions } from "./types";

export function createTowerDefenseGame(options: CreateTowerDefenseGameOptions) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: options.parent,
    width: 390,
    height: 720,
    backgroundColor: "#0d0f13",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: "arcade",
      arcade: {
        debug: false,
      },
    },
    scene: [BootScene, PreloadScene, GameScene, GameOverScene],
    callbacks: {
      postBoot: (game) => {
        game.registry.set("dailyXp", options.dailyXp);
        game.registry.set("powerupTokens", options.powerupTokens);
        game.registry.set("userId", options.userId);
        game.registry.set("onGameOver", options.onGameOver);
      },
    },
  });
}