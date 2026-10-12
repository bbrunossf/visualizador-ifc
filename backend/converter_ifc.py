"""Conversão de modelos IFC para o formato XKT do xeokit.

O XKT é o formato nativo do xeokit-sdk: um modelo grande carrega no navegador em
segundos, porque a geometria já vai indexada e pronta para a GPU. A conversão é
feita pelo ``convert2xkt`` (pacote ``@xeokit/xeokit-convert``, do Node.js), que
lê o IFC direto e escreve o XKT::

    convert2xkt -s modelo.ifc -b -o modelo.xkt

O flag ``-b`` (compressBuffers) é o que faz a diferença de ordem de grandeza:
sem ele o XKT sai com os buffers e o metadado sem compressão — medido num IFC de
1,2 MB de estrutura metálica, **14,03 MB contra 1,29 MB** com o flag. Com o
flag, o metadado chega íntegro ao viewer (751 metaobjetos e 249 property sets,
com os valores inline, do jeito que o SDK lê).

Por que existe um só pipeline
-----------------------------

O xeokit documenta um pipeline alternativo, de duas ferramentas, que preserva o
reaproveitamento de geometria que já existe no IFC e entrega um XKT bem menor —
mas ele passa pelo ``cxconverter`` (ifc2gltf), software **proprietário** da
Creoox::

    community    1 ferramenta   XKT 1,29 MB   249 property sets   open source
    cxconverter  2 ferramentas  XKT 0,14 MB   484 property sets   proprietária

A versão gratuita do cxconverter é a **de avaliação**, e ela não é neutra: o
binário reescreve o nome do ``IfcProject`` no metadado acrescentando
``- evaluation version`` — o nome que o viewer mostra como nome do modelo.
Verificado convertendo o mesmo IFC pelos dois caminhos: o arquivo de entrada tem
zero ocorrências, a saída do cxconverter tem uma, a saída do community tem zero.
A marca só sai comprando licença e preenchendo ``licenceKey`` no
``cxconverter.json`` (a conversão não avisa nada: a saída do executável de
avaliação é idêntica à de uma licenciada).

Como existe caminho gratuito e sem marca, este projeto usa só ele e aceita o
arquivo maior.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

EXT_XKT = ".xkt"
EXT_IFC = ".ifc"

#: Nome da variável de ambiente que aponta para o JS do pacote de conversão.
ENV_CONVERT2XKT = "CONVERT2XKT_JS"

#: Caminhos usuais do pacote npm quando instalado globalmente.
_CAMINHOS_CONVERT2XKT = (
    "AppData/Roaming/npm/node_modules/@xeokit/xeokit-convert/convert2xkt.js",
    "node_modules/@xeokit/xeokit-convert/convert2xkt.js",
    "/usr/local/lib/node_modules/@xeokit/xeokit-convert/convert2xkt.js",
    "/usr/lib/node_modules/@xeokit/xeokit-convert/convert2xkt.js",
)


class ErroConversao(RuntimeError):
    """Falha ao converter o modelo (ferramenta ausente, IFC inválido, etc.)."""


# ─────────────────────────────────────────────────────────────────────────────
# Descoberta da ferramenta
# ─────────────────────────────────────────────────────────────────────────────
def _comando_convert2xkt() -> list[str]:
    """Comando para chamar o ``convert2xkt``.

    Prefere o JS do pacote chamado pelo ``node``: o ``.cmd`` que o npm instala
    só existe no Windows e não roda sem shell, e usar shell com nome de arquivo
    do usuário abriria espaço para injeção de comando.
    """
    candidatos: list[Path] = []
    do_ambiente = os.environ.get(ENV_CONVERT2XKT)
    if do_ambiente:
        candidatos.append(Path(do_ambiente))

    shim = shutil.which("xeokit-convert")
    if shim:
        # O shim do npm mora ao lado de node_modules/; é de lá que vem o JS.
        candidatos.append(Path(shim).parent / "node_modules/@xeokit/xeokit-convert/convert2xkt.js")

    candidatos += [Path.home() / c for c in _CAMINHOS_CONVERT2XKT]

    for caminho in candidatos:
        if caminho.is_file():
            return ["node", str(caminho)]

    # Último recurso: confiar no executável que estiver no PATH.
    if shim:
        return [shim]

    raise ErroConversao(
        "convert2xkt não encontrado. Instale com "
        "'npm install -g @xeokit/xeokit-convert' (precisa do Node.js) ou defina "
        f"{ENV_CONVERT2XKT} apontando para convert2xkt.js."
    )


def ferramentas() -> dict:
    """Diz se a ferramenta de conversão está disponível nesta máquina."""
    rel: dict = {"community": False}
    try:
        caminho = _comando_convert2xkt()
        rel["community"] = True
        rel["convert2xkt"] = caminho[-1]
    except ErroConversao as exc:
        rel["erro_community"] = str(exc)
    return rel


# ─────────────────────────────────────────────────────────────────────────────
# Execução da ferramenta
# ─────────────────────────────────────────────────────────────────────────────
def _executar(comando: list[str], cwd: Path) -> str:
    """Roda um comando e devolve a saída; levanta ErroConversao se falhar."""
    processo = subprocess.run(
        comando, cwd=str(cwd), capture_output=True, text=True,
        encoding="utf-8", errors="replace",
    )
    saida = f"{processo.stdout or ''}{processo.stderr or ''}".strip()
    if processo.returncode != 0:
        ultimas = "\n".join(saida.splitlines()[-8:])
        raise ErroConversao(
            f"{Path(comando[0]).name} falhou (código {processo.returncode}):\n{ultimas}"
        )
    return saida


def _estatisticas(saida: str) -> dict:
    """Extrai os números que o convert2xkt imprime ao final da conversão."""
    numeros = {
        "metaobjetos": r"Converted metaobjects:\s*(\d+)",
        "property_sets": r"Converted property sets:\s*(\d+)",
        "objetos": r"Converted drawable objects:\s*(\d+)",
        "geometrias": r"Converted geometries:\s*(\d+)",
        "triangulos": r"Converted triangles:\s*(\d+)",
        "vertices": r"Converted vertices:\s*(\d+)",
        "tiles": r"Converted tiles:\s*(\d+)",
        "tempo_ferramenta_s": r"Conversion time:\s*([\d.]+)",
    }
    rel: dict = {}
    for chave, padrao in numeros.items():
        achado = re.search(padrao, saida)
        if achado:
            rel[chave] = int(achado.group(1)) if chave != "tempo_ferramenta_s" else float(achado.group(1))
    return rel


# ─────────────────────────────────────────────────────────────────────────────
# Conversão
# ─────────────────────────────────────────────────────────────────────────────
def _nome_seguro(nome: str) -> str:
    """Reduz o nome a algo que não escapa da pasta e não quebra a linha de comando."""
    base = Path(nome).name                      # corta qualquer diretório (../)
    base = re.sub(r"[^A-Za-z0-9._-]", "_", base)
    return base or "modelo"


def converter(
    ifc: str | Path,
    destino: str | Path,
    nome: str | None = None,
) -> dict:
    """Converte um IFC em XKT e deixa o resultado em ``destino``.

    Trabalha numa pasta temporária própria (o arquivo original não é tocado nem
    renomeado) e devolve um dicionário com o caminho do XKT e as estatísticas da
    conversão.
    """
    origem = Path(ifc)
    if not origem.is_file():
        raise ErroConversao(f"Arquivo não encontrado: {origem}")
    if origem.suffix.lower() != EXT_IFC:
        raise ErroConversao(f"Esperado um arquivo {EXT_IFC}, recebido: {origem.name}")

    pasta_destino = Path(destino)
    pasta_destino.mkdir(parents=True, exist_ok=True)

    comando = _comando_convert2xkt()
    inicio = time.time()
    detalhes: dict = {}

    with tempfile.TemporaryDirectory(prefix="ifc2xkt_") as tmp:
        pasta_tmp = Path(tmp)
        # Nome sem espaços: as ferramentas de linha de comando tratam mal
        # caminhos com espaço, e o XKT herda o radical do arquivo de origem.
        local = pasta_tmp / _nome_seguro(origem.name)
        shutil.copy2(origem, local)
        raiz = local.with_suffix("")
        saida = pasta_tmp / f"{raiz.name}{EXT_XKT}"

        texto = _executar(comando + ["-s", str(local), "-b", "-o", str(saida), "-l"], pasta_tmp)

        if not saida.is_file():
            raise ErroConversao("A conversão terminou sem gerar o arquivo .xkt")

        detalhes.update(_estatisticas(texto))
        detalhes["xkt_bytes"] = saida.stat().st_size

        # Só agora o resultado entra na pasta servida — o nome final carrega data
        # e hora para que duas conversões do mesmo modelo não se sobrescrevam.
        rotulo = _nome_seguro(nome or raiz.name)
        carimbo = time.strftime("%Y_%m_%d_%H%M%S")
        final = pasta_destino / f"{rotulo}_{carimbo}{EXT_XKT}"
        shutil.move(str(saida), str(final))

    detalhes["tempo_total_s"] = round(time.time() - inicio, 2)
    return {
        "arquivo": final.name,
        "caminho": str(final),
        "pipeline": "community",
        "estatisticas": detalhes,
    }


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Converte um modelo IFC em XKT.")
    parser.add_argument("ifc", nargs="?", help="arquivo .ifc de entrada")
    parser.add_argument("--destino", default="var/app-data/models", help="pasta dos .xkt")
    parser.add_argument("--nome", default=None, help="nome do modelo (sem extensão)")
    parser.add_argument("--listar-ferramentas", action="store_true", help="mostra as ferramentas disponíveis e sai")
    args = parser.parse_args(argv)

    if args.listar_ferramentas:
        for chave, valor in ferramentas().items():
            print(f"{chave}: {valor}")
        return 0

    if not args.ifc:
        parser.error("informe o arquivo .ifc (ou use --listar-ferramentas)")

    try:
        resultado = converter(args.ifc, args.destino, args.nome)
    except ErroConversao as exc:
        print(f"erro: {exc}", file=sys.stderr)
        return 1

    print(f"pipeline: {resultado['pipeline']}")
    print(f"arquivo:  {resultado['caminho']}")
    for chave, valor in resultado["estatisticas"].items():
        print(f"  {chave}: {valor}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
