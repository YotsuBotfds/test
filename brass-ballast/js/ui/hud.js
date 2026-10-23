// STUB (WP22 replaces) — canvas HUD. API: DESIGN §4.11.
export class HUD {
  constructor(game) {
    this.game = game;
    this.banner = null;
  }
  update(dt) {
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.time) this.banner = null;
    }
  }
  announce(title, sub = '', opts = {}) {
    this.banner = { title, sub, t: 0, time: opts.time || 2.5 };
  }
  draw(ctx, renderer) {
    const g = this.game;
    const run = g.run;
    const p = g.world?.players?.[0];
    if (!run || !p) return;
    renderer.applyScreen(ctx);
    ctx.font = 'bold 16px Georgia, serif';
    ctx.fillStyle = '#fff3c4';
    ctx.textAlign = 'left';
    ctx.fillText(`Hull ${Math.ceil(p.hp)}/${p.stats.maxHp}  Steam ${Math.round(p.steam)}  Bombs ${p.bombs}`, 16, 28);
    ctx.fillText(`Lv ${run.level}  XP ${Math.floor(run.xp)}/${run.xpNext}  Score ${run.score}  x${run.combo.toFixed(1)}`, 16, 50);
    ctx.fillText(`Stage ${run.stageIndex + 1}  Wave ${run.wave}/${run.waveCount}  Cogs ${run.cogs}`, 16, 72);
    const boss = g.world.bosses?.[0];
    if (boss) {
      ctx.fillStyle = '#300';
      ctx.fillRect(renderer.cssW / 2 - 200, 20, 400, 14);
      ctx.fillStyle = '#d8452f';
      ctx.fillRect(renderer.cssW / 2 - 200, 20, 400 * Math.max(0, boss.hp / boss.maxHp), 14);
    }
    if (this.banner) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 40px Georgia, serif';
      ctx.fillStyle = '#ffcf4a';
      ctx.fillText(this.banner.title, renderer.cssW / 2, renderer.cssH * 0.3);
      ctx.font = '20px Georgia, serif';
      ctx.fillText(this.banner.sub, renderer.cssW / 2, renderer.cssH * 0.3 + 34);
    }
  }
}
