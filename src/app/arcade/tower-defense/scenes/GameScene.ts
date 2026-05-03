import Phaser from "phaser";
import type { TowerDefenseResult } from "../types";

export class GameScene extends Phaser.Scene {
  private score = 0;
  private waveReached = 1;
  private enemiesDefeated = 0;
  private powerupsUsed = 0;
  private scoreText?: Phaser.GameObjects.Text;

  constructor() {
    super("GameScene");
  }

  create() {
    const dailyXp = this.registry.get("dailyXp") as number;
    const powerupTokens = this.registry.get("powerupTokens") as number;

    this.add.rectangle(195, 360, 390, 720, 0x0d0f13);

    this.add.text(24, 28, "FOCUS DEFENDER", {
      fontFamily: "monospace",
      fontSize: "24px",
      color: "#ffffff",
    });

    this.add.text(24, 64, `Daily XP: ${dailyXp}`, {
      fontFamily: "monospace",
      fontSize: "16px",
      color: "#00cfc8",
    });

    this.add.text(24, 88, `Powerups: ${powerupTokens}`, {
      fontFamily: "monospace",
      fontSize: "16px",
      color: "#00cfc8",
    });

    this.scoreText = this.add.text(24, 130, "Score: 0", {
      fontFamily: "monospace",
      fontSize: "20px",
      color: "#ffffff",
    });

    this.add.text(24, 640, "Click enemies to destroy them", {
      fontFamily: "monospace",
      fontSize: "15px",
      color: "#aeb7c2",
    });

    this.spawnTestEnemy();

    this.time.addEvent({
      delay: 900,
      loop: true,
      callback: () => this.spawnTestEnemy(),
    });

    this.time.delayedCall(30000, () => {
      this.finishRun();
    });
  }

  private spawnTestEnemy() {
    const enemy = this.add.circle(390, Phaser.Math.Between(190, 540), 14, 0xff4d6d);
    enemy.setInteractive({ useHandCursor: true });

    this.tweens.add({
      targets: enemy,
      x: -20,
      duration: Phaser.Math.Between(3500, 6000),
      onComplete: () => {
        enemy.destroy();
      },
    });

    enemy.on("pointerdown", () => {
      enemy.destroy();
      this.score += 100;
      this.enemiesDefeated += 1;
      this.scoreText?.setText(`Score: ${this.score}`);
    });
  }

  private finishRun() {
    const result: TowerDefenseResult = {
      score: this.score,
      waveReached: this.waveReached,
      enemiesDefeated: this.enemiesDefeated,
      powerupsUsed: this.powerupsUsed,
    };

    this.scene.start("GameOverScene", result);
  }
}