"""API do visualizador: recebe o IFC, converte em XKT e serve os modelos.

O backend faz três coisas e nada mais — de propósito:

* ``POST /converter`` recebe um ``.ifc``, converte e guarda o ``.xkt``;
* ``GET /modelos`` lista o que está disponível para visualizar;
* ``DELETE /modelos/{nome}`` remove um modelo.

Não há banco de dados. O estado do sistema é a própria pasta de modelos
(``MODELS_DIR``): o que está lá é o que o viewer pode abrir. Isso mantém a
aplicação de pé com uma dependência só (Python + o pacote de conversão) e é o
que permite publicá-la sem nenhum dado de cliente junto.

Rodar::

    python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
    .venv/Scripts/python main.py            # http://localhost:9000

Variáveis de ambiente: ``MODELS_DIR``, ``HOST``, ``PORT``, ``IFC_MAX_MB`` e
``CONVERT2XKT_JS`` (esta última, veja converter_ifc).
"""

from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from converter_ifc import EXT_XKT, ErroConversao, converter, ferramentas

MODELS_DIR = Path(os.environ.get("MODELS_DIR", "var/app-data/models")).resolve()
IFC_MAX_MB = float(os.environ.get("IFC_MAX_MB", "500"))
TAMANHO_BLOCO = 1024 * 1024

app = FastAPI(title="Visualizador IFC", version="1.0.0")

# A interface roda em outra porta (o dev server do Remix, 3000) e chama esta API
# no navegador; sem CORS o browser bloqueia a chamada.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _nome_seguro(nome: str) -> str:
    """Impede que um nome vindo do cliente escape da pasta de modelos.

    Sem isso, ``DELETE /modelos/../../consulta-ligacoes.ts`` apagaria qualquer
    arquivo que o processo alcança — a validação de caminho é obrigatória em
    rota que recebe nome de arquivo pela URL.
    """
    base = Path(nome).name
    if not base or base != nome.strip() or not base.lower().endswith(EXT_XKT):
        raise HTTPException(status_code=400, detail="Nome de modelo inválido.")
    return base


def _listar_modelos() -> list[dict]:
    if not MODELS_DIR.is_dir():
        return []
    modelos = []
    for arquivo in sorted(MODELS_DIR.glob(f"*{EXT_XKT}")):
        estado = arquivo.stat()
        modelos.append(
            {
                "arquivo": arquivo.name,
                "modelo": arquivo.stem,
                "bytes": estado.st_size,
                "modificado_em": int(estado.st_mtime),
            }
        )
    return modelos


def _guardar_upload(origem, destino: Path) -> int:
    """Grava o upload em disco em blocos, com teto de tamanho."""
    limite = IFC_MAX_MB * 1024 * 1024
    escritos = 0
    with destino.open("wb") as saida:
        while True:
            bloco = origem.read(TAMANHO_BLOCO)
            if not bloco:
                break
            escritos += len(bloco)
            if escritos > limite:
                saida.close()
                destino.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"Arquivo maior que o limite de {IFC_MAX_MB:.0f} MB.",
                )
            saida.write(bloco)
    return escritos


@app.get("/health")
def health() -> dict:
    """Estado do serviço e quais pipelines de conversão estão disponíveis."""
    return {
        "status": "ok",
        "models_dir": str(MODELS_DIR),
        "modelos": len(_listar_modelos()),
        "pipelines": ferramentas(),
    }


@app.post("/converter")
def converter_modelo(
    arquivo: UploadFile = File(...),
    nome: str | None = Form(None),
) -> JSONResponse:
    """Converte um IFC em XKT e deixa o modelo pronto para visualizar.

    Um pipeline só, aberto (``convert2xkt``). O alternativo, que geraria um XKT
    menor, passa por software proprietário da Creoox — o motivo de não estar
    aqui, com as medições, está no cabeçalho de ``converter_ifc``.
    """
    if not (arquivo.filename or "").lower().endswith(".ifc"):
        raise HTTPException(status_code=400, detail="Envie um arquivo .ifc.")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    # O upload vai para um temporário: se a conversão falhar, nada fica pela
    # metade na pasta de modelos. O arquivo temporário é sempre removido.
    with tempfile.TemporaryDirectory(prefix="upload_ifc_") as tmp:
        caminho_tmp = Path(tmp) / arquivo.filename
        try:
            _guardar_upload(arquivo.file, caminho_tmp)
            resultado = converter(caminho_tmp, MODELS_DIR, nome=nome)
        except ErroConversao as exc:
            # 422: o arquivo chegou, mas não foi possível convertê-lo.
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        finally:
            arquivo.file.close()

    return JSONResponse({"mensagem": "Modelo convertido.", **resultado})


@app.get("/modelos")
def listar_modelos() -> dict:
    return {"models_dir": str(MODELS_DIR), "modelos": _listar_modelos()}


@app.delete("/modelos/{nome}")
def remover_modelo(nome: str) -> dict:
    arquivo = MODELS_DIR / _nome_seguro(nome)
    if not arquivo.is_file():
        raise HTTPException(status_code=404, detail="Modelo não encontrado.")
    tamanho = arquivo.stat().st_size
    arquivo.unlink()
    return {"mensagem": "Modelo removido.", "arquivo": arquivo.name, "bytes": tamanho}


@app.post("/modelos/{nome}/apagar")
def remover_modelo_por_post(nome: str) -> dict:
    """Mesma coisa do DELETE — alguns clientes HTTP não enviam DELETE."""
    return remover_modelo(nome)


def _limpar_temporarios_antigos() -> int:
    """Remove pastas de conversão órfãs (processo interrompido no meio).

    A conversão roda numa pasta temporária própria e a remove ao final; se o
    processo morrer no meio, a pasta fica. A varredura pega só as pastas com o
    prefixo que este código cria, e só as que passaram de algumas horas.
    """
    import time

    limite = time.time() - 6 * 3600
    removidos = 0
    raiz = Path(tempfile.gettempdir())
    for pasta in raiz.glob("ifc2xkt_*"):
        try:
            if pasta.is_dir() and pasta.stat().st_mtime < limite:
                shutil.rmtree(pasta, ignore_errors=True)
                removidos += 1
        except OSError:
            continue
    return removidos


if __name__ == "__main__":
    import uvicorn

    _limpar_temporarios_antigos()
    uvicorn.run(
        app,
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "9000")),
    )
