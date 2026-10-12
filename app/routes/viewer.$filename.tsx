import { json, type LoaderFunctionArgs, type MetaFunction } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";

import XeokitLayout from "~/components/XeokitLayout";
import { listarModelos, nomeDeArquivoValido } from "~/utils/models.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: `Viewer — ${data?.modelo.nome ?? "Modelo"}` },
  { name: "description", content: "Visualizador de modelos BIM" },
];

export async function loader({ params }: LoaderFunctionArgs) {
  const arquivo = nomeDeArquivoValido(params.filename);
  if (!arquivo) {
    throw new Response("Modelo inválido", { status: 400 });
  }

  const modelos = await listarModelos();
  const modelo = modelos.find((item) => item.arquivo === arquivo);
  if (!modelo) {
    throw new Response("Modelo não encontrado", { status: 404 });
  }

  return json({ modelo, xktSrc: `/models/${encodeURIComponent(arquivo)}` });
}

export const handle = {
  hideSidebar: true,
};

export default function ViewerPage() {
  const { modelo, xktSrc } = useLoaderData<typeof loader>();

  return (
    <>
      <Link
        to="/"
        className="absolute left-3 top-3 z-30 rounded bg-neutral-800/80 px-3 py-1 text-xs text-neutral-200 backdrop-blur hover:bg-neutral-700"
      >
        ← Modelos
      </Link>
      <XeokitLayout modelId={modelo.arquivo} nome={modelo.nome} xktSrc={xktSrc} />
    </>
  );
}
