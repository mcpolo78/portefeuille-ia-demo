// Client du serveur MCP de la démo (/api/mcp, JSON-RPC 2.0). Toutes les données de l'interface passent par lui.
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { OutilMcp } from './types';
import { ReglesService } from './regles.service';

interface ReponseRpc<T> {
  result?: { structuredContent: T; isError?: boolean; content?: { text: string }[]; tools?: OutilMcp[] };
  error?: { message: string };
}

@Injectable({ providedIn: 'root' })
export class McpService {
  private readonly http = inject(HttpClient);
  private readonly regles = inject(ReglesService);
  private idRpc = 0;

  private rpc<T>(method: string, params?: unknown) {
    return firstValueFrom(
      this.http.post<ReponseRpc<T>>(
        '/api/mcp',
        { jsonrpc: '2.0', id: ++this.idRpc, method, params },
        { headers: { Accept: 'application/json, text/event-stream' } },
      ),
    );
  }

  /** Appelle un outil ; les règles personnalisées partent dans _meta.regles. */
  async outil<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const params: Record<string, unknown> = { name, arguments: args };
    const regles = this.regles.perso();
    if (regles) params['_meta'] = { regles };
    const data = await this.rpc<T>('tools/call', params);
    if (data.error) throw new Error(data.error.message);
    if (data.result!.isError) throw new Error(data.result!.content?.[0]?.text || 'Erreur outil');
    return data.result!.structuredContent;
  }

  async outils(): Promise<OutilMcp[]> {
    const data = await this.rpc<never>('tools/list');
    return data.result?.tools ?? [];
  }
}
