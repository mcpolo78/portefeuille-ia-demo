// Serveur MCP : comment brancher son propre agent, et la liste des outils exposés (tools/list).
import { ChangeDetectionStrategy, Component, inject, resource } from '@angular/core';
import { McpService } from '../../core/mcp.service';

@Component({
  selector: 'app-mcp',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'vue vue-mcp' },
  template: `
    <article class="carte">
      <h2>Branchez votre propre agent</h2>
      <p>
        Les sept outils métier du portefeuille sont exposés par un serveur <abbr title="Model Context Protocol">MCP</abbr> public, en lecture seule.
        Le tableau de bord, les fiches et l'assistant passent tous par lui.
      </p>
      <pre><code>claude mcp add --transport http portefeuille {{ origine }}/api/mcp</code></pre>
      <ul class="outils-mcp">
        @for (o of outils.value() ?? []; track o.name) {
          <li><code>{{ o.name }}</code> : {{ o.description.split('.')[0] }}.</li>
        }
      </ul>
      <p class="muet petit">
        Architecture : interface <strong>Angular 22</strong> (composants standalone, signals, sans zone.js), graphiques SVG faits main
        → fonctions serverless Node sur Vercel → <code>/api/assistant</code> (Ministral 14B avec appels d'outils, réponses en flux) et
        <code>/api/mcp</code> (JSON-RPC 2.0, Streamable HTTP, aussi en stdio). Aucune dépendance npm côté serveur.
        <a href="https://github.com/mcpolo78/portefeuille-ia-demo">Code source</a>.
      </p>
    </article>
  `,
})
export class Mcp {
  private readonly mcp = inject(McpService);
  protected readonly origine = location.origin;
  protected readonly outils = resource({ loader: () => this.mcp.outils() });
}
