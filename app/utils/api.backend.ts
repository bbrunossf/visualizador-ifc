/**
 * Cliente do backend de conversão (backend/main.py).
 *
 * Este módulo roda no servidor do Remix: o navegador manda o arquivo para a
 * rota do Remix, que repassa ao backend Python. Assim o endereço do backend
 * não precisa ser público e o upload não depende de CORS.
 */

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:9000";

export interface ResultadoConversao {
  arquivo?: string;
  mensagem?: string;
  pipeline?: string;
  estatisticas?: Record<string, number>;
  erro?: string;
}

export interface EstadoBackend {
  ok: boolean;
  modelos: number;
  pipelines?: Record<string, unknown>;
  erro?: string;
}

/** Converte um IFC em XKT. O backend guarda o resultado na pasta de modelos. */
export async function converterIfc(
  arquivo: File,
  nome?: string,
  usarCxconverter = false,
): Promise<ResultadoConversao> {
  const formulario = new FormData();
  formulario.append("arquivo", arquivo);
  if (nome) formulario.append("nome", nome);
  formulario.append("cxconverter", String(usarCxconverter));

  try {
    const resposta = await fetch(`${BACKEND_URL}/converter`, {
      method: "POST",
      body: formulario,
    });
    const dados = (await resposta.json().catch(() => ({}))) as ResultadoConversao & {
      detail?: string;
    };
    if (!resposta.ok) {
      return { erro: dados.detail || `Falha na conversão (HTTP ${resposta.status}).` };
    }
    return dados;
  } catch (erro) {
    return {
      erro:
        `Não foi possível falar com o backend de conversão em ${BACKEND_URL}. ` +
        `Suba o serviço (backend/main.py) ou ajuste BACKEND_URL. (${(erro as Error).message})`,
    };
  }
}

/** Estado do backend: se está no ar e quais pipelines estão disponíveis. */
export async function estadoDoBackend(): Promise<EstadoBackend> {
  try {
    const resposta = await fetch(`${BACKEND_URL}/health`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!resposta.ok) return { ok: false, modelos: 0, erro: `HTTP ${resposta.status}` };
    const dados = await resposta.json();
    return { ok: true, modelos: dados.modelos ?? 0, pipelines: dados.pipelines };
  } catch (erro) {
    return { ok: false, modelos: 0, erro: (erro as Error).message };
  }
}
