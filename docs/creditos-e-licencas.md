# Créditos e licenças de terceiros

O código deste repositório é MIT (veja [../LICENSE](../LICENSE)). Ele usa
software de terceiros, cada um com a sua licença — e uma das dependências exige
atenção de quem for usar isto comercialmente.

## Dependências

| Componente | Papel | Licença |
|---|---|---|
| [xeokit-sdk](https://xeokit.io/) | motor 3D que carrega o XKT no navegador | **AGPL-3.0** |
| [@xeokit/xeokit-convert](https://github.com/xeokit/xeokit-convert) (`convert2xkt`) | converte IFC/glTF em XKT (Node.js) | AGPL-3.0 |
| [Remix](https://remix.run/) / React | aplicação web | MIT |
| [FastAPI](https://fastapi.tiangolo.com/) / Uvicorn | API de conversão | MIT / BSD |
| [Tailwind CSS](https://tailwindcss.com/) | estilos | MIT |
| [cxconverter](https://github.com/Creoox/creoox-ifc2gltfcxconverter) (opcional) | ifc2gltf da Creoox, pipeline alternativo | proprietária (versão gratuita = avaliação) |

### Sobre o xeokit-sdk ser AGPL-3.0

O xeokit-sdk é distribuído sob AGPL-3.0 ou licença comercial. Como **este
projeto é aberto**, a obrigação da AGPL de disponibilizar o código-fonte está
atendida por definição. Quem quiser usar o SDK em produto fechado precisa de
licença comercial da xeokit — o que vale para o SDK, não para o código deste
recorte, que segue MIT.

### Sobre o cxconverter (pipeline opcional)

O binário do `ifc2gltf` da Creoox não é open source: a versão gratuita é de
avaliação, exige configuração explícita para ser usada e **embute marca d'água
invisível na geometria** (string `Embedded invisible evaluation watermark`
presente no executável). O uso comercial exige licença da Creoox. Por isso o
pipeline padrão deste projeto é o **community**, que é 100% open source.

## Modelo usado nas imagens do README

As capturas de tela usam o modelo **Duplex**, que acompanha o repositório do
[`xeokit/xeokit-convert`](https://github.com/xeokit/xeokit-convert)
(`examples/sample-project/assets/Duplex.ifc`).

O arquivo do modelo **não** é redistribuído aqui: nenhum `.ifc` ou `.xkt` é
versionado neste repositório. Para reproduzir as imagens, baixe o modelo no
repositório de origem e converta-o pela própria aplicação.
