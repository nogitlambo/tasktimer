import Phaser from "phaser";
import type { TowerDefenseResult } from "../types";

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super("GameOverScene");
  }

  create(result: TowerDefenseResult) {
    const onGameOver = this.registry.get("onGameOver") as
      | ((result: TowerDefenseResult) => void)
      | undefined;

    onGameOver?.(result);

    this.add.rectangle(195, 360, 390, 720, 0x0d0f13);

    this.add.text(70, 230, "RUN COMPLETE", {
      fontFamily: "monospace",
      fontSize: "28px",
      color: "#ffffff",
    });

    this.add.text(92, 285, `Score: ${result.score}`, {
      fontFamily: "monospace",
      fontSize: "20px",
      color: "#00cfc8",
    });

    this.add.text(92, 318, `Enemies: ${result.enemiesDefeated}`, {
      fontFamily: "monospace",
      fontSize: "20px",
      color: "#00cfc8",
    });

    const restartText = this.add.text(96, 390, "Click to restart", {
      fontFamily: "monospace",
      fontSize: "20px",
      color: "#ffffff",
    });

    restartText.setInteractive({ useHandCursor: true });
    restartText.on("pointerdown", () => {
      this.scene.start("GameScene");
    });
  }
}