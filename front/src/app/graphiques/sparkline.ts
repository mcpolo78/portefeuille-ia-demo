// Petite courbe des indicateurs, entièrement en template Angular (SVG + signals).
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const L = 100;
const H = 30;

@Component({
  selector: 'svg[appSparkline]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sparkline', viewBox: `0 0 ${L} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' },
  template: `
    <svg:path class="spark-aire" [attr.d]="chemin() + 'L' + L + ',' + H + 'L0,' + H + 'Z'" />
    <svg:path class="spark" vector-effect="non-scaling-stroke" [attr.d]="chemin()" />
  `,
})
export class Sparkline {
  readonly valeurs = input.required<number[]>({ alias: 'appSparkline' });
  protected readonly L = L;
  protected readonly H = H;

  protected readonly chemin = computed(() => {
    const v = this.valeurs();
    if (v.length < 2) return 'M0,0';
    const min = Math.min(...v);
    const max = Math.max(...v);
    const Y = (x: number) => H - 2 - ((x - min) / (max - min || 1)) * (H - 4);
    return v.map((x, i) => `${i ? 'L' : 'M'}${((i / (v.length - 1)) * L).toFixed(1)},${Y(x).toFixed(1)}`).join('');
  });
}
