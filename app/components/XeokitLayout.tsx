/**
 * Tela do visualizador: o canvas do xeokit, o painel do objeto sob o cursor e o
 * nome do modelo aberto.
 *
 * No sistema de origem este componente também hospedava o formulário de
 * "características da obra" (tipo de serviço, cliente final, condição da obra…),
 * que gravava no banco pela action da rota. Aquelas variáveis categóricas são de
 * outro produto — não fazem parte de um visualizador de IFC — então o formulário
 * e o envio saíram junto com o banco.
 */
import React from "react";
import { useEffect, useRef, useState } from "react";

import XeokitViewer from "~/components/XeokitViewer";
import { subscribeHoveredObject, type HoveredObjectInfo } from "~/lib/viewerRegistry";

interface XeokitLayoutProps {
  modelId: string;
  nome: string;
  xktSrc: string;
}

const formatPropertyValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const HoveredObjectPanel: React.FC<{ object: HoveredObjectInfo | null }> = ({ object }) => {
  const wantedProperties = object
    ? object.properties.filter((property) =>
        ["id", "name", "weight"].includes(String(property.name).toLowerCase()),
      )
    : [];

  return (
    <div
      style={{
        position: "absolute",
        left: "12px",
        bottom: "12px",
        zIndex: 4,
        width: "min(360px, calc(100% - 24px))",
        height: "250px",
        overflow: "hidden",
        padding: "10px 12px",
        borderRadius: "6px",
        background: "rgba(20, 27, 36, 0.92)",
        color: "#f8fafc",
        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.25)",
        fontSize: "12px",
        lineHeight: 1.4,
        pointerEvents: "none",
      }}
    >
      {!object ? (
        <span style={{ color: "#cbd5e1" }}>Passe o cursor sobre um objeto</span>
      ) : (
        <>
          <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {object.name || "Objeto sem nome"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "76px 1fr", gap: "2px 8px" }}>
            <strong>ID</strong><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={object.id}>{object.id}</span>
            <strong>Tipo</strong><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{object.type || "—"}</span>
            <strong>AABB</strong><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={object.aabb ? object.aabb.map((v) => Number(v).toFixed(3)).join(", ") : undefined}>{object.aabb ? object.aabb.map((v) => Number(v).toFixed(3)).join(", ") : "—"}</span>
          </div>
          {Object.keys(object.attributes).length > 0 && (
            <div style={{ marginTop: "8px", borderTop: "1px solid rgba(203,213,225,.3)", paddingTop: "6px" }}>
              <strong>Atributos</strong>
              {Object.entries(object.attributes).slice(0, 3).map(([name, value]) => (
                <div key={name} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }} title={name}>{name}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", color: "#bfdbfe" }} title={formatPropertyValue(value)}>{formatPropertyValue(value)}</span>
                </div>
              ))}
              {Object.keys(object.attributes).length > 3 && <div style={{ color: "#cbd5e1", marginTop: "3px" }}>+ {Object.keys(object.attributes).length - 3} atributos</div>}
            </div>
          )}
          {wantedProperties.length > 0 && (
            <div style={{ marginTop: "8px", borderTop: "1px solid rgba(203,213,225,.3)", paddingTop: "6px" }}>
              <strong>Propriedades</strong>
              {wantedProperties.map((property, index) => (
                <div key={`${property.setName}-${property.name}-${index}`} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden" }}>
                  <span title={property.setName || property.name} style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{property.name}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", color: "#bfdbfe" }} title={formatPropertyValue(property.value)}>{formatPropertyValue(property.value)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const XeokitLayout: React.FC<XeokitLayoutProps> = ({ modelId, nome, xktSrc }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredObject, setHoveredObject] = useState<HoveredObjectInfo | null>(null);

  useEffect(() => subscribeHoveredObject(setHoveredObject), []);

  return (
    <div style={{ width: "100vw", height: "89vh", position: "relative", display: "flex" }}>
      {/* Canvas do xeokit */}
      <div style={{ flex: 1, position: "relative" }}>
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "100%",
            background: "lightblue",
            backgroundImage: "linear-gradient(lightblue, white)",
          }}
        />

        <HoveredObjectPanel object={hoveredObject} />
      </div>

      {/* Nome do modelo aberto */}
      <div
        style={{
          position: "absolute",
          top: "10px",
          // 112px deixa a etiqueta logo ao lado do link "← Modelos", que fica no
          // canto superior esquerdo da rota do viewer.
          left: "112px",
          zIndex: 3,
          background: "rgba(255, 255, 255, 0.9)",
          // A etiqueta tem fundo claro: a cor do texto precisa ser explícita,
          // senão herda o texto claro do tema escuro do root e desaparece.
          color: "#111827",
          padding: "10px",
          borderRadius: "5px",
          fontSize: "14px",
        }}
      >
        <strong>Modelo:</strong> {nome}
      </div>

      <XeokitViewer modelId={modelId} xktSrc={xktSrc} canvasRef={canvasRef} />
    </div>
  );
};

export default XeokitLayout;
