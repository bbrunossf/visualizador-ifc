"""Conversão de modelos IFC para o formato XKT do xeokit.

O XKT é o formato nativo do xeokit-sdk: um modelo grande carrega no navegador em
segundos, porque a geometria já vai indexada e pronta para a GPU. Este módulo
converte um arquivo ``.ifc`` em ``.xkt`` por um de dois pipelines:

**community** (padrão) — uma ferramenta, toda open source::

    convert2xkt -s modelo.ifc -b -o modelo.xkt

O ``convert2xkt`` lê o IFC direto (via web-ifc) e achata a geometria: cada
instância vira vértices próprios. É simples e não depende de nada licenciado.
Medido num IFC de 1,2 MB (estrutura metálica, Tekla Structures):

============================  ============  =============  ==========
                              community     cxconverter    unidade
============================  ============  =============  ==========
XKT com ``-b``                1,29          0,14           MB
XKT sem ``-b``                14,03         0,96           MB
metaobjetos                   751           751            —
property sets                 249           484            —
triângulos                    736.920       5.930          —
tempo de conversão            5,6           2,0            s
licença                       open source   proprietária   —
============================  ============  =============  ==========

O ``-b`` (compressBuffers) é o que faz a diferença de ordem de grandeza: sem
ele o XKT sai com os buffers e o metadado sem compressão — 14 MB no mesmo
modelo. Com ele, 1,29 MB e o metadado íntegro (os 751 metaobjetos e as 249
propriedades chegam inline ao viewer).

**cxconverter** (opcional) — duas ferramentas, a primeira proprietária::

    cxconverter -i modelo.ifc -o modelo.glb -m modelo.json
    convert2xkt  -s modelo.glb -b -m modelo.json -o modelo.xkt

Preserva o reaproveitamento de geometria que já existe no IFC (medido no mesmo
modelo: 4.912 reusos, 99% de compressão) e entrega um XKT **9x menor**
(0,14 MB), com mais property sets (484 contra 249). Em troca, o ``ifc2gltf`` da
Creoox exige licença comercial: a versão gratuita é de avaliação e **embute
marca d'água invisível** nos componentes POSITION dos vértices — verificável
pela string ``Embedded invisible evaluation watermark`` dentro do binário.

Por isso o padrão é o community: o projeto funciona inteiro sem nada
licenciado. O pipeline cxconverter entra por ``usar_cxconverter=True`` ou pela
variável de ambiente ``CXCONVERTER_PATH`` apontando para o executável.

Uso pela linha de comando::

    python converter_ifc.py modelo.ifc --destino var/app-data/models
    python converter_ifc.py modelo.ifc --destino var/app-data/models --cxconverter
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
#: Nome da variável de ambiente que aponta para o executável do cxconverter.
ENV_CXCONVERTER = "CXCONVERTER_PATH"

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
# Descoberta das ferramentas
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


def _comando_cxconverter() -> str:
    """Caminho do executável do cxconverter, se houver."""
    do_ambiente = os.environ.get(ENV_CXCONVERTER)
    if do_ambiente and Path(do_ambiente).is_file():
        return do_ambiente
    achado = shutil.which("cxconverter") or shutil.which("cxconverter.exe")
    if achado:
        return achado
    raise ErroConversao(
        "cxconverter não encontrado. Baixe o ifc2gltf em "
        "https://github.com/Creoox/creoox-ifc2gltfcxconverter/releases e defina "
        f"{ENV_CXCONVERTER} apontando para o executável. Atenção: a versão de "
        "avaliação embute marca d'água invisível na geometria; o uso comercial "
        "exige licença da Creoox."
    )


def ferramentas() -> dict:
    """Diz quais pipelines estão disponíveis nesta máquina."""
    rel: dict = {"community": False, "cxconverter": False}
    try:
        _comando_convert2xkt()
        rel["community"] = True
    except ErroConversao as exc:
        rel["erro_community"] = str(exc)
    try:
        rel["cxconverter"] = True
        rel["cxconverter_caminho"] = _comando_cxconverter()
    except ErroConversao:
        pass
    return rel


# ─────────────────────────────────────────────────────────────────────────────
# Execução das ferramentas
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


def normalizar_metamodelo(json_file: str | Path) -> dict:
    """Converte o JSON do cxconverter para o formato que o XKT espera.

    O JSON do cxconverter guarda as propriedades **uma vez** num array de topo
    (``properties``) e cada ``propertySet`` aponta para elas **por índice**
    (``"properties": [0, 1, 2, ...]``). O XKT precisa das propriedades dentro do
    próprio propertySet, na forma ``{"name", "value", "type"}`` — foi assim que
    o pipeline community gravou as 249 dele. Sem esta passagem, o painel de
    propriedades do viewer abre vazio, porque o índice não é um valor.

    Devolve um resumo do que foi ajustado.
    """
    caminho = Path(json_file)
    try:
        dados = json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ErroConversao(f"Metadados ilegíveis ({caminho}): {exc}") from exc

    catalogo = dados.get("properties") if isinstance(dados, dict) else None
    catalogo = catalogo if isinstance(catalogo, list) else []

    resolvidas = sem_origem = 0
    for pset in dados.get("propertySets") or []:
        if not isinstance(pset, dict):
            continue
        inline = []
        for item in pset.get("properties") or []:
            if isinstance(item, dict):          # já veio no formato certo
                inline.append(item)
                continue
            if isinstance(item, int) and 0 <= item < len(catalogo):
                prop = catalogo[item]
                inline.append(
                    {
                        "name": prop.get("name"),
                        "value": prop.get("value"),
                        "type": prop.get("ifcValueType") or prop.get("valueType"),
                    }
                )
                resolvidas += 1
            else:
                sem_origem += 1
        pset["properties"] = inline

    caminho.write_text(json.dumps(dados, ensure_ascii=False), encoding="utf-8")
    return {
        "propriedades_resolvidas": resolvidas,
        "propriedades_sem_origem": sem_origem,
        "property_sets": len(dados.get("propertySets") or []),
    }


def preserve_profile_in_metadata(json_file: str | Path) -> int:
    """Copia o perfil (``ObjectType``) e a ``tag`` de cada metaobjeto para
    ``attributes`` — e devolve quantos foram ajustados.

    Por quê: o ``cxconverter`` grava o perfil e a tag como campos de topo de
    cada metaobjeto do JSON. O xeokit-sdk, ao carregar o metadado do XKT, só
    expõe ``name``/``type``/``attributes``/``propertySets`` — todo campo de topo
    fora dessa lista é descartado, e o viewer fica sem mostrar o perfil da peça
    (no caso de estruturas metálicas, o perfil é a informação que o engenheiro
    procura primeiro). Movendo os dois campos para dentro de ``attributes``, eles
    sobrevivem à conversão e aparecem no painel de propriedades.
    """
    caminho = Path(json_file)
    try:
        dados = json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ErroConversao(f"Metadados ilegíveis ({caminho}): {exc}") from exc

    meta_objetos = dados.get("metaObjects") if isinstance(dados, dict) else None
    if isinstance(meta_objetos, dict):
        objetos = list(meta_objetos.values())
    elif isinstance(meta_objetos, list):
        objetos = meta_objetos
    else:
        objetos = []

    ajustados = 0
    for obj in objetos:
        if not isinstance(obj, dict):
            continue
        attributes = obj.get("attributes")
        if not isinstance(attributes, dict):
            attributes = {}
        mudou = False
        for campo in ("ObjectType", "tag"):
            valor = obj.get(campo)
            if valor not in (None, ""):
                attributes[campo] = valor
                mudou = True
        if mudou:
            obj["attributes"] = attributes
            ajustados += 1

    if ajustados:
        caminho.write_text(
            json.dumps(dados, ensure_ascii=False), encoding="utf-8"
        )
    return ajustados


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
    usar_cxconverter: bool | None = None,
) -> dict:
    """Converte um IFC em XKT e deixa o resultado em ``destino``.

    Trabalha numa pasta temporária própria (o arquivo original não é tocado nem
    renomeado) e devolve um dicionário com o caminho do XKT, o pipeline usado e
    as estatísticas da conversão.
    """
    origem = Path(ifc)
    if not origem.is_file():
        raise ErroConversao(f"Arquivo não encontrado: {origem}")
    if origem.suffix.lower() != EXT_IFC:
        raise ErroConversao(f"Esperado um arquivo {EXT_IFC}, recebido: {origem.name}")

    pasta_destino = Path(destino)
    pasta_destino.mkdir(parents=True, exist_ok=True)

    if usar_cxconverter is None:
        # Sem escolha explícita: usa o cxconverter só se estiver configurado.
        usar_cxconverter = bool(os.environ.get(ENV_CXCONVERTER)) or bool(
            shutil.which("cxconverter") or shutil.which("cxconverter.exe")
        )

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

        if usar_cxconverter:
            cx = _comando_cxconverter()
            glb = pasta_tmp / f"{raiz.name}.glb"
            meta = pasta_tmp / f"{raiz.name}.json"
            _executar([cx, "-i", str(local), "-o", str(glb), "-m", str(meta)], pasta_tmp)
            # Duas passagens no JSON antes de virar XKT: as propriedades vêm por
            # índice (viram valores inline) e o perfil/tag entram em attributes,
            # que é o único campo de topo que o xeokit-sdk expõe além de
            # name/type/propertySets.
            ajuste = normalizar_metamodelo(meta)
            preservados = preserve_profile_in_metadata(meta)
            texto = _executar(
                comando + ["-s", str(glb), "-b", "-m", str(meta), "-o", str(saida), "-l"],
                pasta_tmp,
            )
            pipeline = "cxconverter"
            detalhes = {"perfis_preservados": preservados, "glb_bytes": glb.stat().st_size, **ajuste}
        else:
            texto = _executar(comando + ["-s", str(local), "-b", "-o", str(saida), "-l"], pasta_tmp)
            pipeline = "community"

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
        "pipeline": pipeline,
        "estatisticas": detalhes,
    }


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Converte um modelo IFC em XKT.")
    parser.add_argument("ifc", nargs="?", help="arquivo .ifc de entrada")
    parser.add_argument("--destino", default="var/app-data/models", help="pasta dos .xkt")
    parser.add_argument("--nome", default=None, help="nome do modelo (sem extensão)")
    parser.add_argument("--cxconverter", action="store_true", help="usar o pipeline proprietário (XKT menor)")
    parser.add_argument("--listar-ferramentas", action="store_true", help="mostra os pipelines disponíveis e sai")
    args = parser.parse_args(argv)

    if args.listar_ferramentas:
        for chave, valor in ferramentas().items():
            print(f"{chave}: {valor}")
        return 0

    if not args.ifc:
        parser.error("informe o arquivo .ifc (ou use --listar-ferramentas)")

    try:
        resultado = converter(args.ifc, args.destino, args.nome, args.cxconverter or None)
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
