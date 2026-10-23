// STUB (WP21 replaces) — achievements & tracker. DESIGN §4.9, WP21.
export const ACHIEVEMENTS = [
  { id: 'firstBlood', name: 'First Blood', desc: 'Down your first Syndicate craft.', icon: 'icon_medal_bronze' },
  { id: 'matriarch', name: 'Sink the Matriarch', desc: 'Defeat the Iron Matriarch.', icon: 'icon_medal_silver' },
  { id: 'grandVoyage', name: 'The Grand Voyage', desc: 'Complete the campaign.', icon: 'icon_medal_gold' },
];

export class AchievementTracker {
  constructor(game) {
    this.game = game;
  }
}
