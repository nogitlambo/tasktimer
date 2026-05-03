export type TowerDefenseResult = {
  score: number;
  waveReached: number;
  enemiesDefeated: number;
  powerupsUsed: number;
};

export type CreateTowerDefenseGameOptions = {
  parent: HTMLElement;
  dailyXp: number;
  powerupTokens: number;
  userId: string;
  onGameOver: (result: TowerDefenseResult) => void;
};