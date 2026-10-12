# Manifesto do recorte — Visualizador IFC

Registro de proveniência desta cópia: de onde ela veio, o que foi aproveitado,
o que ficou de fora e por quê. Existe para que a publicação seja auditável —
quem olhar o repositório público consegue verificar que nada de cliente ou de
credencial veio junto.

## Origem

- **Projeto de origem:** sistema interno de gestão de obras (repositório
  privado), branch `master`, commit `faca54a` (12/10/2026).
- **Como foi copiado:** arquivo por arquivo, com `git show master:<caminho>`,
  para uma pasta nova. **Sem histórico do Git de origem** — os commits antigos
  daquele repositório carregam um dump de produção, bancos SQLite e logs, e
  nada disso pode ser alcançável a partir daqui.
- **Originais preservados:** em `_NAO_PUBLICAR/origem/` (fora do Git), para
  conferência lado a lado. O que está no repositório é a versão sanitizada.

## O que foi aproveitado

| Arquivo de origem | Aqui |
|---|---|
| `backend/converter_ifc.py` | `backend/converter_ifc.py` — reescrito: dois pipelines, normalização de metadados, sem `print` de depuração |
| `backend/main.py` | `backend/main.py` — reescrito: só conversão e entrega, sem banco |
| `app/components/XeokitViewer.tsx` | idem — cena xeokit, sem o agente de IA (644 → 581 linhas) |
| `app/components/XeokitLayout.tsx` | reescrito enxuto: viewer + painel do objeto sob o cursor |
| `app/routes/models.$filename.ts` | idem, com validação de caminho |
| `app/routes/viewer.$modelId.tsx` | virou `viewer.$filename.tsx`: a identidade do modelo é o nome do arquivo, não uma linha de banco |
| `app/routes/ifc.upload.tsx` | virou `_index.tsx`: galeria + conversão numa tela |
| `app/utils/api.backend.ts` | idem, simplificado |
| `app/lib/viewerRegistry.ts` | idem, sem alteração |
| `app/root.tsx`, `vite.config.ts`, `package.json` | reescritos: sem Syncfusion, 54 → 8 dependências diretas |
| `tsconfig.json`, `postcss.config.js`, `tailwind.config.ts`, `app/*.css`, `app/entry.client.tsx` | idem, sem alteração |

## O que ficou de fora (e por quê)

| Fora | Motivo |
|---|---|
| `backend/parser.py` (ifcopenshell) e `backend/database.py` (psycopg2) | fazem a leitura de pesos e quantidade de aço por elemento — é o BI, não o visualizador |
| `backend/models.py` | modelos Pydantic do banco |
| `app/utils/obras.server.ts`, `app/db.server.ts`, `prisma/` | banco relacional do sistema |
| `app/lib/viewerAgentAPI.ts`, `viewerAgentTools.ts`, `viewerAnalysis.ts`, `viewerAgentSocket.ts`, `viewerAgentProtocol.ts` | o agente de IA que conversa com o modelo 3D — outro projeto |
| `server/`, `scripts/`, `deploy_scripts/` | agente, pipeline de análise estrutural e infraestrutura de deploy |
| `app/routes/converter2.tsx` | não é sobre IFC: é um experimento de conversão de datas (dia juliano) com nome enganoso |
| `app/routes/verIfc.tsx` | protótipo morto: importa `web-ifc-viewer`, dependência que não existe no `package.json` |
| `app/scripts/xeokit-sdk.es.js` (6,2 MB) | bundle vendorizado do xeokit-sdk; agora o SDK vem do npm como dependência declarada |
| `env.example` | **carrega um `SESSION_SECRET` com valor real** mais a string de conexão do banco. Não foi copiado: aqui existe um `.env.example` novo, com os campos deste projeto e sem valor nenhum |
| `dump_producao.dump`, `*.db`, `*.log`, `timer_python/` | artefatos de produção e de outros produtos do sistema de origem |
| Modelos `.ifc`/`.xkt` | são de cliente: não entram no repositório, nem aqui nem no público |

## Integridade

- Os arquivos aproveitados foram copiados de **um único commit** (`faca54a`),
  identificável no repositório privado de origem.
- Nenhum arquivo do repositório público tem história de Git anterior: o
  histórico começa no commit inicial deste recorte.
- `_NAO_PUBLICAR/` está no `.gitignore` e contém: as cópias originais, o
  `config.ini`/segredos, os scripts de captura de tela e o `cxconverter.exe`
  baixado para teste (software proprietário que não pode ser redistribuído).
