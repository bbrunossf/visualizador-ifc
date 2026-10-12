/* eslint-disable @typescript-eslint/no-explicit-any --
 * Instância do viewer do xeokit-sdk sem declarações de tipo (.d.ts).
 */
// app/lib/viewerRegistry.ts
//
// Registro (singleton) da instância ativa do viewer XKT.
//
// O viewer é criado de forma imperativa dentro de um `useEffect` em
// app/components/XeokitViewer.tsx. Para que a camada agentAPI (e futuras
// integrações) possa acessá-lo sem prop drilling, a instância é publicada
// aqui, em um módulo de browser (sem React).
//
// Decisão de projeto registrada em docs/VIEWER_AGENT_API.md §13.1, item 5.

export interface HoveredObjectInfo {
  id: string;
  name: string | null;
  type: string | null;
  originalSystemId: string | null;
  parentId: string | null;
  aabb: [number, number, number, number, number, number] | null;
  numTriangles: number | null;
  attributes: Record<string, unknown>;
  properties: Array<{
    setName: string | null;
    name: string;
    value: unknown;
    valueType: string | number | null;
  }>;
}

type HoverListener = (object: HoveredObjectInfo | null) => void;

let activeViewer: any = null;
let activeModelId: string | null = null;
let initialState: any = null;
const hoverListeners = new Set<HoverListener>();
let hoveredObject: HoveredObjectInfo | null = null;

/** Publica a instância ativa do viewer, associada a um modelo. */
export function registerViewer(viewer: any, modelId: string, state?: any): void {
  activeViewer = viewer;
  activeModelId = modelId;
  initialState = state ?? null;
}

/**
 * Remove o registro se (e somente se) a instância registrada for a mesma.
 * Evita que o cleanup de um viewer antigo apague um viewer recém-montado.
 */
export function unregisterViewer(viewer: any): void {
  if (activeViewer === viewer) {
    activeViewer = null;
    activeModelId = null;
    initialState = null;
    setHoveredObject(null);
  }
}

/** Retorna a instância ativa do viewer, ou `null` se nenhuma estiver registrada. */
export function getViewer(): any {
  return activeViewer;
}

/** Retorna o `modelId` associado ao viewer registrado, ou `null`. */
export function getModelId(): string | null {
  return activeModelId;
}

/** Indica se há um viewer carregado e registrado. */
export function isReady(): boolean {
  return activeViewer !== null && activeModelId !== null;
}

/** Retorna o estado visual inicial capturado no registro, ou `null`. */
export function getInitialState(): any {
  return initialState;
}

export function setHoveredObject(object: HoveredObjectInfo | null): void {
  hoveredObject = object;
  for (const listener of hoverListeners) {
    listener(hoveredObject);
  }
}

export function getHoveredObject(): HoveredObjectInfo | null {
  return hoveredObject;
}

export function subscribeHoveredObject(listener: HoverListener): () => void {
  hoverListeners.add(listener);
  listener(hoveredObject);
  return () => hoverListeners.delete(listener);
}