import {
  json,
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
  type ActionFunctionArgs,
  type MetaFunction,
} from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";

import { converterIfc, estadoDoBackend } from "~/utils/api.backend";
import { listarModelos, removerModelo } from "~/utils/models.server";

export const meta: MetaFunction = () => [
  { title: "Visualizador IFC" },
  {
    name: "description",
    content: "Converte modelos IFC para XKT e abre no navegador com o xeokit",
  },
];

export async function loader() {
  const [modelos, backend] = await Promise.all([listarModelos(), estadoDoBackend()]);
  return json({ modelos, backend });
}

export async function action({ request }: ActionFunctionArgs) {
  // O Remix lê o formulário em memória: o teto padrão do handler é 3 MB e um
  // IFC de estrutura passa disso fácil, então o limite é declarado aqui.
  const formulario = await unstable_parseMultipartFormData(
    request,
    unstable_createMemoryUploadHandler({ maxPartSize: 600 * 1024 * 1024 }),
  );

  const intencao = String(formulario.get("intencao") || "");

  if (intencao === "remover") {
    const arquivo = String(formulario.get("arquivo") || "");
    const removido = await removerModelo(arquivo);
    return json({
      recado: removido
        ? `Modelo “${arquivo}” removido.`
        : "O modelo já não estava na pasta.",
      erro: !removido,
    });
  }

  const arquivo = formulario.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return json({ recado: "Escolha um arquivo .ifc para converter.", erro: true });
  }

  const nome = String(formulario.get("nome") || "").trim() || undefined;
  const comCxconverter = formulario.get("cxconverter") === "on";

  const resultado = await converterIfc(arquivo, nome, comCxconverter);
  if (resultado.erro) {
    return json({ recado: `Não foi possível converter: ${resultado.erro}`, erro: true });
  }

  const tamanho = resultado.estatisticas?.xkt_bytes;
  const mb = tamanho ? `${(tamanho / 1024 / 1024).toFixed(2)} MB` : "—";
  const tempo = resultado.estatisticas?.tempo_total_s;
  return json({
    recado:
      `“${resultado.arquivo}” pronto (${mb}` +
      `${tempo ? `, ${tempo}s` : ""}) pelo pipeline ${resultado.pipeline}.`,
    erro: false,
  });
}

export default function Index() {
  const { modelos, backend } = useLoaderData<typeof loader>();
  const recado = useActionData<typeof action>();
  const navegacao = useNavigation();
  const convertendo = navegacao.state === "submitting";

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold">Visualizador IFC</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Envie um modelo <code>.ifc</code> — ele é convertido para <code>.xkt</code> e aberto
          no navegador. Os modelos ficam em <code>{backend.ok ? "MODELS_DIR" : "..."}</code> e
          nada é versionado junto com o código.
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          Backend de conversão:{" "}
          {backend.ok ? (
            <span className="text-emerald-400">no ar</span>
          ) : (
            <span className="text-amber-400">
              fora do ar ({backend.erro}) — a conversão não vai funcionar, mas os modelos já
              convertidos continuam abrindo
            </span>
          )}
          {backend.ok && backend.pipelines ? (
            <>
              {" · pipelines: "}
              {backend.pipelines.cxconverter ? "community + cxconverter" : "community"}
            </>
          ) : null}
        </p>
      </header>

      <section className="mb-10 rounded-lg border border-neutral-700 bg-neutral-800/40 p-5">
        <h2 className="mb-4 text-lg font-medium">Converter um IFC</h2>
        <Form method="post" encType="multipart/form-data" className="flex flex-wrap items-end gap-4">
          <input type="hidden" name="intencao" value="converter" />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-neutral-400">Arquivo .ifc</span>
            <input
              type="file"
              name="arquivo"
              accept=".ifc"
              required
              className="rounded border border-neutral-600 bg-neutral-900 p-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-neutral-400">Nome do modelo (opcional)</span>
            <input
              type="text"
              name="nome"
              placeholder="ex.: Galpão A"
              className="rounded border border-neutral-600 bg-neutral-900 p-2 text-sm"
            />
          </label>
          {backend.pipelines?.cxconverter ? (
            <label className="flex items-center gap-2 text-sm text-neutral-400">
              <input type="checkbox" name="cxconverter" />
              usar cxconverter (XKT bem menor)
            </label>
          ) : null}
          <button
            type="submit"
            disabled={convertendo}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {convertendo ? "Convertendo…" : "Converter"}
          </button>
        </Form>
        {convertendo ? (
          <p className="mt-3 text-xs text-neutral-400">
            Um modelo grande pode levar minutos: o upload e a conversão acontecem antes da
            resposta.
          </p>
        ) : null}
        {recado ? (
          <p
            className={`mt-3 text-sm ${recado.erro ? "text-amber-400" : "text-emerald-400"}`}
            role="status"
          >
            {recado.recado}
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium">
          Modelos disponíveis <span className="text-neutral-500">({modelos.length})</span>
        </h2>
        {modelos.length === 0 ? (
          <p className="text-sm text-neutral-400">
            Nenhum modelo ainda. Converta um IFC acima — ou copie um <code>.xkt</code> direto
            para a pasta de modelos.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-700">
            {modelos.map((modelo) => (
              <li key={modelo.arquivo} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <Link
                    to={`/viewer/${encodeURIComponent(modelo.arquivo)}`}
                    className="truncate font-medium text-sky-400 hover:underline"
                  >
                    {modelo.nome}
                  </Link>
                  <p className="text-xs text-neutral-500">
                    {(modelo.bytes / 1024 / 1024).toFixed(2)} MB · convertido em{" "}
                    {new Date(modelo.modificadoEm).toLocaleString("pt-BR")}
                  </p>
                </div>
                <Form method="post">
                  <input type="hidden" name="intencao" value="remover" />
                  <input type="hidden" name="arquivo" value={modelo.arquivo} />
                  <button
                    type="submit"
                    className="rounded border border-neutral-600 px-3 py-1 text-xs text-neutral-300 hover:border-amber-500 hover:text-amber-400"
                  >
                    Remover
                  </button>
                </Form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
