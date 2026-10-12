/**
 * Fonte da verdade dos modelos: a pasta no disco.
 *
 * O sistema original guardava o catálogo de modelos num banco relacional e a
 * pasta era só um detalhe de implementação — daí a consulta ao banco para
 * descobrir o nome do arquivo de cada obra. Aqui não há banco: o que está em
 * MODELS_DIR é o que existe para visualizar. Ganha-se uma dependência a menos
 * e a mesma informação, porque o nome do arquivo já carrega obra, data e hora.
 */
import fs from "fs/promises";
import path from "path";

export const MODELS_DIR =
  process.env.MODELS_DIR || path.join(process.cwd(), "var", "app-data", "models");

export const EXTENSAO_XKT = ".xkt";

export interface Modelo {
  /** Nome do arquivo, com extensão. É a chave usada nas rotas. */
  arquivo: string;
  /** Nome sem a extensão, para exibir na tela. */
  nome: string;
  bytes: number;
  modificadoEm: string;
}

/**
 * Aceita apenas um nome de arquivo simples, terminando em .xkt.
 *
 * Sem esta checagem, `GET /models/../../.env` sairia da pasta de modelos — a
 * rota recebe o nome pela URL, então validar o caminho é obrigatório.
 */
export function nomeDeArquivoValido(nome: string | undefined): string | null {
  if (!nome) return null;
  if (nome !== path.basename(nome)) return null;
  if (nome.includes("..") || nome.includes("/") || nome.includes("\\")) return null;
  if (!nome.toLowerCase().endsWith(EXTENSAO_XKT)) return null;
  return nome;
}

export function caminhoDoModelo(nome: string): string {
  const valido = nomeDeArquivoValido(nome);
  if (!valido) throw new Error("Nome de modelo inválido.");
  return path.join(MODELS_DIR, valido);
}

export async function listarModelos(): Promise<Modelo[]> {
  try {
    const entradas = await fs.readdir(MODELS_DIR);
    const modelos: Modelo[] = [];
    for (const entrada of entradas) {
      if (!entrada.toLowerCase().endsWith(EXTENSAO_XKT)) continue;
      const informacao = await fs.stat(path.join(MODELS_DIR, entrada));
      modelos.push({
        arquivo: entrada,
        nome: path.basename(entrada, EXTENSAO_XKT),
        bytes: informacao.size,
        modificadoEm: informacao.mtime.toISOString(),
      });
    }
    // Mais recentes primeiro: quem converteu um modelo agora quer vê-lo agora.
    return modelos.sort((a, b) => b.modificadoEm.localeCompare(a.modificadoEm));
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw erro;
  }
}

export async function removerModelo(nome: string): Promise<boolean> {
  try {
    await fs.unlink(caminhoDoModelo(nome));
    return true;
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw erro;
  }
}
