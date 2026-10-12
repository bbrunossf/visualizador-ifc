# Visualizador IFC

Aplicação web que **converte modelos IFC em XKT** e os abre no navegador com o
[xeokit](https://xeokit.io/): câmera orbital, ferramenta de medição, planos de
corte e um painel que mostra os dados do elemento sob o cursor (nome, tipo,
perfil e propriedades vindas do próprio IFC).

![Visualizador aberto com um modelo](docs/imagens/viewer.png)

![Galeria de modelos convertidos](docs/imagens/galeria.png)

*Modelo das imagens: [Duplex](https://github.com/xeokit/xeokit-convert), a
amostra que acompanha o repositório do `xeokit-convert`. Nenhum modelo é
versionado neste repositório.*

---

## O que ela faz

1. **Converte** — você envia um `.ifc`; o backend chama o `convert2xkt` e grava
   o `.xkt` numa pasta local (`MODELS_DIR`).
2. **Lista** — a tela inicial mostra os modelos disponíveis, com tamanho e data
   de conversão.
3. **Visualiza** — o viewer carrega o XKT por streaming e monta a cena: o mesmo
   pipeline serve para um galpão metálico de 1 MB e para um modelo de centenas
   de MB.

Não há banco de dados. O estado do sistema é a pasta de modelos: o que está lá é
o que o viewer abre. Isso deixa a aplicação de pé com duas dependências
(Python e o pacote de conversão do Node) e faz com que nenhum dado de cliente
precise entrar no repositório.

## Origem desta cópia

Este projeto é um **recorte** de um sistema interno maior de gestão de obras.
Daquele sistema vieram o conversor IFC→XKT e o viewer; ficaram de fora — por
serem outro produto — o banco relacional com apontamento de horas e custos, os
relatórios e o BI, as variáveis categóricas de obra e o agente de IA que
conversa com o modelo 3D.

O que mudou nesta separação, além de remover as partes que não pertencem a um
visualizador:

| No sistema original | Aqui |
|---|---|
| Banco relacional (Prisma/PostgreSQL) com o catálogo de modelos | a pasta `MODELS_DIR` é a fonte da verdade |
| Importação de biblioteca comercial de UI (Syncfusion) no layout raiz | removida: o visualizador não usa nenhum componente dela |
| Agente de IA acoplado ao viewer (API semântica exposta em `window`) | removido, junto com o WebSocket do agente |
| Formulário de características da obra gravando no banco | removido |
| `convert_ifc_to_glb` chamava o `cxconverter` e o `convert2xkt` sem compressão | pipeline community com `-b` por padrão (veja abaixo) |
| Metadados do `cxconverter` iam crus para o XKT | passam por normalização: as propriedades vêm por índice e viram valores inline |
| Nome de arquivo do XKT montado a partir de obra + prédio + data | nome do modelo + data e hora |
| `fs.readFile` de arquivo de modelo sem validar o nome vindo da URL | validação de caminho em toda rota que recebe nome de arquivo |

## Como rodar

### Pré-requisitos

- **Python 3.11+** (backend)
- **Node.js 20+** (frontend) e o pacote de conversão:

```bash
npm install -g @xeokit/xeokit-convert
```

### Backend (conversão e entrega dos XKT)

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # Linux/macOS: .venv/bin/python
.venv/Scripts/python main.py                              # http://localhost:9000
```

O backend também funciona sozinho, pela linha de comando:

```bash
.venv/Scripts/python converter_ifc.py modelo.ifc --destino var/app-data/models
.venv/Scripts/python converter_ifc.py --listar-ferramentas
```

### Frontend

```bash
npm install
cp .env.example .env      # ajuste MODELS_DIR e BACKEND_URL se precisar
npm run dev               # http://localhost:3000
```

Em produção: `npm run build && npm start`.

### Pipeline opcional: cxconverter

O `cxconverter` (ifc2gltf, da Creoox) gera um XKT **9x menor** e com mais
*property sets*, preservando o reaproveitamento de geometria do IFC. Para usá-lo,
baixe o executável em
[Creoox/creoox-ifc2gltfcxconverter](https://github.com/Creoox/creoox-ifc2gltfcxconverter/releases)
e aponte a variável de ambiente. Na tela inicial aparece a opção de usar esse
pipeline por conversão.

> **Licença:** o pipeline cxconverter **não é open source**. O binário gratuito
> é a versão de avaliação da Creoox e embute **marca d'água invisível** nos
> componentes POSITION da geometria (a string `Embedded invisible evaluation
> watermark` está dentro do executável). O uso comercial exige licença da
> Creoox. Por isso o **padrão do projeto é o pipeline community**.

## Os dois pipelines, medidos

Mesmo modelo (`.ifc` de 1,2 MB de estrutura metálica, exportado do Tekla
Structures), mesma máquina:

|                              | community          | cxconverter       |
|------------------------------|--------------------|-------------------|
| Ferramentas                  | 1 (`convert2xkt`)  | 2 (+ `cxconverter`) |
| **XKT com `-b`**             | **1,29 MB**        | **0,14 MB**       |
| XKT sem `-b`                 | 14,03 MB           | 0,96 MB           |
| Metaobjetos no XKT           | 751                | 751               |
| Property sets                | 249                | 484               |
| Triângulos                   | 736.920            | 5.930             |
| Tempo de conversão           | 5,6 s              | 2,0 s             |
| Licença                      | open source        | proprietária (avaliação) |

Três coisas que essa tabela mostra e que custaram para descobrir:

- **O `-b` (compressBuffers) é decisivo.** Sem ele o XKT sai com buffers e
  metadados sem compressão: 14 MB contra 1,29 MB no mesmo modelo. É a diferença
  entre um modelo que abre em segundos e um que trava o navegador.
- **O metadado precisa viajar junto.** O `convert2xkt` embute no XKT o JSON de
  metadados passado em `-m`; sem ele, o XKT fica com uma raiz "default" e o
  painel de propriedades abre vazio.
- **O JSON do `cxconverter` usa índices, não valores.** Cada `propertySet` aponta
  para um array global de propriedades por posição (`"properties": [0, 1, 2…]`).
  O viewer espera os valores inline (`{name, value, type}`), como o pipeline
  community grava. Sem essa normalização o painel de propriedades mostra nada —
  em `backend/converter_ifc.py` isso é a função `normalizar_metamodelo`.

## Estrutura

```
backend/
  main.py              API FastAPI: /converter, /modelos, DELETE /modelos/{nome}
  converter_ifc.py     conversão IFC → XKT, os dois pipelines e a normalização
  requirements.txt
app/
  routes/_index.tsx        galeria: converte, lista e remove modelos
  routes/viewer.$filename.tsx  abre um modelo no viewer
  routes/models.$filename.ts   entrega o .xkt por streaming
  components/XeokitViewer.tsx  cena xeokit (câmera, medição, corte, pick)
  components/XeokitLayout.tsx  tela do viewer e painel do objeto sob o cursor
  utils/models.server.ts   a pasta de modelos como fonte da verdade
  utils/api.backend.ts     cliente do backend de conversão
docs/imagens/          imagens deste README
var/app-data/models/   onde os .xkt ficam (fora do git)
```

## Limitações conhecidas

- **A primeira conversão depois de ligar a máquina é bem mais lenta.** Node subindo e o módulo
  wasm do `web-ifc` carregando custam segundos que não aparecem no tempo interno do conversor: o
  mesmo modelo levou **22 s a frio contra 5,6 s já aquecido**. Os tempos da tabela acima são de
  execução aquecida.
- O **painel do objeto sob o cursor** não pôde ser verificado por automação (o
  hover depende do ponteiro real sobre o canvas); o código é o do sistema de
  origem, sem alteração.
- O upload do frontend passa pela memória do servidor do Remix — modelos da
  ordem de centenas de MB pedem um *upload handler* em disco.
- A conversão é **síncrona**: para um IFC grande a requisição fica aberta até o
  fim. Um modelo de 52 MB pode levar minutos.
- Não há autenticação: a aplicação foi feita para rodar em rede local. Publicar
  na internet exige pôr autenticação na frente.
- O `-i`/`-x` do `convert2xkt` (incluir/excluir tipos) não é exposto na
  interface.

## Licença

O código deste repositório está sob **MIT** (veja [LICENSE](LICENSE)). As
dependências mantêm as suas licenças — em especial o **xeokit-sdk, que é
AGPL-3.0**: como este projeto é aberto, a obrigação de disponibilizar a fonte
está atendida; uso comercial do SDK sem abrir o código exige licença da
xeokit. O pipeline opcional com `cxconverter` depende de software proprietário
da Creoox (veja acima).
