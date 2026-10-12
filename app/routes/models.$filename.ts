/**
 * Entrega o arquivo .xkt para o XKTLoaderPlugin do xeokit.
 *
 * O modelo é servido pela rota (e não direto de public/) porque MODELS_DIR fica
 * fora do repositório: assim o XKT não precisa ser versionado e um modelo de
 * cliente nunca entra no pacote publicado.
 */
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import type { LoaderFunctionArgs } from "@remix-run/node";

import { caminhoDoModelo, nomeDeArquivoValido } from "~/utils/models.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const arquivo = nomeDeArquivoValido(params.filename);
  if (!arquivo) {
    throw new Response("Arquivo inválido", { status: 400 });
  }

  const filePath = caminhoDoModelo(arquivo);

  try {
    const informacao = await stat(filePath);
    const stream = createReadStream(filePath);

    return new Response(stream as unknown as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": informacao.size.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Accept-Ranges": "bytes",
      },
    });
  } catch {
    throw new Response("Arquivo não encontrado", { status: 404 });
  }
};
