# Segurança e privacidade

Este repositório é um **recorte** de um sistema interno de gestão de obras. Antes
da publicação, o código passou por varredura automática e por revisão item a item
do que entra e do que não entra.

## Varredura do recorte

Dez padrões foram procurados em todo o código, documentação e configuração
(excluindo `_NAO_PUBLICAR/`, `node_modules/`, `.venv/` e a pasta de modelos):

| Padrão procurado | Resultado |
|---|---|
| Credencial por rótulo (`senha`, `password`, `api_key`, `secret`, `token`, `bearer`…) | **0** |
| String de conexão (`postgresql://`, `mysql://`, `mongodb://`, `redis://`) | **0** |
| Chave privada (`BEGIN … PRIVATE KEY`) | **0** |
| Chave Google/Firebase (`AIza…`) | **0** |
| Token de serviço (`ghp_…`, `xoxb-…`) | **0** |
| Caminho da máquina de origem (`C:\Users\<algo>`, `/home/<algo>`) | **0** |
| Caminho do laboratório (`J:\laboratorio`) | **0** |
| Marca do sistema de origem (`plena`, `horas_plena`) | **0** |
| Nomes de cliente (Comprex, Santa Edwiges, Sampaio, Serpa, Wellness, Unibras…) | **0** |
| Identificador do agente interno (`viewerAgent`) | **4**, todos no `MANIFESTO.md` |

As quatro ocorrências são **esperadas e intencionais**: são os nomes dos arquivos
do agente de IA que ficou de fora (`viewerAgentAPI.ts`, `viewerAgentTools.ts`…),
citados no registro de proveniência para documentar o que não faz parte deste
recorte. Não são código nem dado — são nomes de arquivo num documento de
auditoria.

## O que não veio do projeto de origem

| Item | Por quê |
|---|---|
| `env.example` do sistema de origem | carrega um `SESSION_SECRET` **com valor real** e a string de conexão do banco. Não foi copiado: aqui existe um `.env.example` novo, com os campos deste projeto e sem nenhum valor |
| Modelos `.ifc` / `.xkt` | são de cliente. Nenhum é versionado: `MODELS_DIR` está no `.gitignore` e o modelo usado nas imagens do README é uma amostra pública (ver `docs/creditos-e-licencas.md`) |
| `dump_producao.dump`, `*.db`, `*.log` | artefatos de produção do sistema de origem |
| `cxconverter.exe` | software proprietário, baixado apenas para teste local: fica em `_NAO_PUBLICAR/`, fora do Git |
| Código do banco, do BI e do agente | outro produto (ver `MANIFESTO.md`) |

Nada disso é alcançável a partir do histórico deste repositório: o recorte
começa num commit inicial, sem os commits do projeto de origem.

## Superfície de segurança da aplicação

- **Validação de caminho.** Toda rota que recebe nome de arquivo
  (`GET /models/:filename`, `/viewer/:filename`, `DELETE /modelos/:nome`)
  rejeita separadores, `..` e qualquer extensão que não seja `.xkt`. Sem isso,
  `GET /models/../../.env` sairia da pasta de modelos e entregaria um arquivo do
  servidor. No backend, o mesmo cuidado aparece no `_nome_seguro` da conversão.
- **Upload.** Teto de tamanho configurável (`IFC_MAX_MB`, padrão 500 MB), gravação
  em blocos (não carrega o arquivo inteiro em memória de uma vez) e em pasta
  temporária própria, sempre removida ao fim — inclusive quando a conversão falha.
- **O conteúdo enviado não é executado.** O IFC é entregue ao conversor de linha
  de comando; o XKT resultante é servido como `application/octet-stream`. Nenhum
  arquivo do usuário vira código.
- **Sem shell.** O código não monta comando por concatenação de string a partir
  de nome de arquivo: as ferramentas são chamadas com a lista de argumentos, e o
  arquivo é copiado para um nome saneado antes de ir ao conversor.
- **CORS liberado.** Faz sentido no escopo do projeto (rede local, frontend em
  outra porta). Em rede compartilhada, restrinja `allow_origins` no `backend/main.py`.
- **Sem autenticação.** É uma ferramenta de uso local: qualquer pessoa com
  acesso à porta vê e apaga modelos. Para publicar na internet, ponha
  autenticação na frente (proxy reverso com login, por exemplo).

## Reproduzindo a varredura

A varredura é um script de ~40 linhas: percorre o projeto, aplica as dez
expressões regulares acima e imprime o que encontrar. Para repeti-la depois de
qualquer alteração, rode-a sobre o projeto com a pasta de modelos excluída.
