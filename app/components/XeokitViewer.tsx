import React, { useEffect, useRef } from 'react';
import * as viewerRegistry from '~/lib/viewerRegistry';

interface XeokitViewerProps {
  modelId: string;
  xktSrc: string;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  //treeViewRef: React.RefObject<HTMLDivElement>;
}

const XeokitViewer: React.FC<XeokitViewerProps> = ({ modelId, xktSrc, canvasRef}) => {
  const viewerRef = useRef<any>(null);
  //const treeViewPluginRef = useRef<any>(null);

  useEffect(() => {
    if (viewerRef.current ) return;
    let viewer: any = null;
    //let treeViewPlugin: any = null;
    let isInitialized = false;
    let distanceMeasurementsPlugin: any;
    let distanceMeasurementsMouseControl: any;
    let distanceMeasurements: any;    
    let endMeasurementEdit: (() => void) | null = null; // For handling measurement edits
    let handleMeasurementKeyDown: ((event: KeyboardEvent) => void) | null = null;
    let handleMeasurementKeyUp: ((event: KeyboardEvent) => void) | null = null;
    let handleSectionKeyDown: ((event: KeyboardEvent) => void) | null = null;
    let handleSectionKeyUp: ((event: KeyboardEvent) => void) | null = null;
    
    const initializeViewer = async () => {
      if (isInitialized || !canvasRef.current ) return;
      try {
        const {
          Viewer,
          XKTLoaderPlugin,
          //TreeViewPlugin,
          DistanceMeasurementsPlugin,
          DistanceMeasurementsMouseControl,
          //PointerLens,
          DistanceMeasurementEditMouseControl, ContextMenu,
          //NavCubePlugin,
          SectionPlanesPlugin, math
        } = await import(          
          '@xeokit/xeokit-sdk/dist/xeokit-sdk.es.js'
        );

        isInitialized = true;
        //treeViewRef.current.innerHTML = '';

        viewer = new Viewer({
          canvasElement: canvasRef.current,
          transparent: true,
          dtxEnabled: true,
          numCachedSectionPlanes: 4 //para as seções
        });

        viewer.camera.eye = [-3.933, 2.855, 27.018];
        viewer.camera.look = [4.400, 3.724, 8.899];
        viewer.camera.up = [-0.018, 0.999, 0.039];
        viewer.cameraControl.panRightClick = false;
        viewer.cameraControl.followPointer = true; //para as seções

        // treeViewPlugin = new TreeViewPlugin(viewer, {
        //   containerElement: treeViewRef.current,
        //   hierarchy: "containment",
        //   autoExpandDepth: 2,
        //   showListItemChildren: true,
        //   sortNodes: true,
        // });

        // const navCube = new NavCubePlugin(viewer, {
        //   canvasId: "myNavCubeCanvas",
        //   color: "lightblue",
        //   visible: true,           // Initially visible (default)
        //   cameraFly: true,       // Fly camera to each selected axis/diagonal
        //   cameraFitFOV: 45,        // How much field-of-view the scene takes once camera has fitted it to view
        //   cameraFlyDuration: 0.5 // How long (in seconds) camera takes to fly to each new axis/diagonal
        // });

        const sectionPlanes = new SectionPlanesPlugin(viewer, {
        overviewCanvasId: "mySectionPlanesOverviewCanvas",
        overviewVisible: true
        });

        const xktLoader = new XKTLoaderPlugin(viewer);
        const sceneModel = await xktLoader.load({
          id: modelId,
          src: xktSrc,
          saoEnabled: true,
          edges: true,
          dtxEnabled: true,
        });

        const metaModel = viewer.metaScene.metaModels[modelId];

        

        sceneModel.on("loaded", () => {
            viewer.cameraFlight.flyTo({
            aabb: viewer.scene.getAABB(),
            duration: 1.0
          });
        });

        sceneModel.on("error", (error: any) => {
          console.error("Erro ao carregar modelo:", error);
        });

        

        //
        // Plugins de Medição
        distanceMeasurementsPlugin = new DistanceMeasurementsPlugin(viewer,            
        );

        distanceMeasurementsPlugin.on("mouseOver", (e: any) => {
          if (endMeasurementEdit) {
            return;
          }
          e.distanceMeasurement.setHighlighted(true);
        });
        distanceMeasurementsPlugin.on("mouseLeave", (e: any) => {
          if (endMeasurementEdit) {
            return;
          }
          e.distanceMeasurement.setHighlighted(false);
        });

        // const pointerLensConfig = {
        //   // Configuring the size of the canvas for the lens effect          
        //   active: true    // Ensure that the lens is active
        // };

        const distanceMeasurementsMouseControl = new DistanceMeasurementsMouseControl(distanceMeasurementsPlugin, {
          //pointerLens: new PointerLens(viewer, pointerLensConfig),
          snapping: true
        });

        //
        handleMeasurementKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'T') {
            distanceMeasurementsMouseControl.activate();
          }
        };

        handleMeasurementKeyUp = (e: KeyboardEvent) => {
          if (e.key === 'G') {
            distanceMeasurementsMouseControl.deactivate();
          }
        };

        document.addEventListener('keydown', handleMeasurementKeyDown);
        document.addEventListener('keyup', handleMeasurementKeyUp);
        //

        // distanceMeasurementsMouseControl.snapping = true;
        // distanceMeasurementsMouseControl.activate();

        

        // Create a context menu to delete and configure measurements
        //------------------------------------------------------------------------------------------------------------------

        let endMeasurementEdit: any = null;

        const distanceMeasurementsContextMenu = new ContextMenu({
            items: [
                [
                    {
                        title: "Clear",
                        doAction: function (context: any) {
                            context.distanceMeasurement.destroy();
                        }
                    },
                    {
                        getTitle: (context: any) => {
                            return context.distanceMeasurement.axisVisible ? "Hide Axis" : "Show Axis";
                        },
                        doAction: function (context: any) {
                            context.distanceMeasurement.axisVisible = !context.distanceMeasurement.axisVisible;
                        }
                    },
                    {
                        getTitle: (context: any) => {
                            return context.distanceMeasurement.xLabelEnabled && context.distanceMeasurement.labelsVisible ? "Disable X Label" : "Enable X Label";
                        },
                        doAction: function (context: any) {
                            context.distanceMeasurement.xLabelEnabled = !context.distanceMeasurement.xLabelEnabled;
                        }
                    },
                    {
                        getTitle: (context: any) => {
                            return context.distanceMeasurement.yLabelEnabled && context.distanceMeasurement.labelsVisible ? "Disable Y Label" : "Enable Y Label";
                        },
                        doAction: function (context: any) {
                            context.distanceMeasurement.yLabelEnabled = !context.distanceMeasurement.yLabelEnabled;
                        }
                    },
                    {
                        getTitle: (context: any) => {
                            return context.distanceMeasurement.zLabelEnabled && context.distanceMeasurement.labelsVisible ? "Disable Z Label" : "Enable Z Label";
                        },
                        doAction: function (context: any) {
                            context.distanceMeasurement.zLabelEnabled = !context.distanceMeasurement.zLabelEnabled;
                        }
                    },
                    {
                        getTitle: (context: any) => {
                            return context.distanceMeasurement.lengthLabelEnabled && context.distanceMeasurement.labelsVisible ? "Disable Length Label" : "Enable Length Label";
                        },
                        doAction: function (context: any) {
                            context.distanceMeasurement.lengthLabelEnabled = !context.distanceMeasurement.lengthLabelEnabled;
                        }
                    },
                    {
                        getTitle: (context: any) => {
                            return context.distanceMeasurement.labelsVisible ? "Hide All Labels" : "Show All Labels";
                        },
                        doAction: function (context: any) {
                            context.distanceMeasurement.labelsVisible = !context.distanceMeasurement.labelsVisible;
                        }
                    },
                    {
                        title: "Edit",
                        doAction: function (context: any) {
                            distanceMeasurementsMouseControl.deactivate();
                            const measurement = context.distanceMeasurement;
                            const edit = new DistanceMeasurementEditMouseControl(measurement, {
                                //pointerLens: new PointerLens(viewer),
                                snapping: true
                            });
                            endMeasurementEdit = () => {
                                edit.deactivate();
                                endMeasurementEdit = null;
                            };
                        }
                    }
                ], [
                    {
                        title: "Clear All",
                        getEnabled: function (context: any) {
                            return (Object.keys(context.distanceMeasurementsPlugin.measurements).length > 0);
                        },
                        doAction: function (context: any) {
                            context.distanceMeasurementsPlugin.clear();
                        }
                    },
                    {
                        getTitle: () => {
                            return "Cancel Measurement";
                        },
                        doAction: function () {
                            distanceMeasurementsMouseControl.reset();
                        }
                    }
                ]
            ]
        });

        distanceMeasurementsContextMenu.on("hidden", () => {
            if (distanceMeasurementsContextMenu.context.distanceMeasurement) {
                distanceMeasurementsContextMenu.context.distanceMeasurement.setHighlighted(false);
            }
        });

        //------------------------------------------------------------------------------------------------------------------
        // Create a context menu to activate and deactivate the control
        //------------------------------------------------------------------------------------------------------------------

        const canvasContextMenu = new ContextMenu({
            enabled: true,
            context: {
                viewer: viewer
            },
            items: [
                [
                    {
                        getTitle: (context: any) => {
                            return distanceMeasurementsMouseControl.active ? "Deactivate Control" : "Activate Control";
                        },
                        doAction: function (context: any) {
                            distanceMeasurementsMouseControl.active
                                ? distanceMeasurementsMouseControl.deactivate()
                                : distanceMeasurementsMouseControl.activate();
                        }
                    },
                    {
                        getTitle: () => {
                            return "Cancel Measurement";
                        },
                        getEnabled: function () {
                            return (!!distanceMeasurementsMouseControl.currentMeasurement);
                        },
                        doAction: function () {
                            distanceMeasurementsMouseControl.reset();
                        }
                    },
                    {
                        getTitle: () => {
                            return "End Editing";
                        },
                        getEnabled: function () {
                            return !!endMeasurementEdit;
                        },
                        doAction: function () {
                            endMeasurementEdit();
                        }
                    }
                ]
            ]
        });

        viewer.scene.canvas.canvas.addEventListener('contextmenu', (event: any) => {
            const canvasPos = getCanvasPosFromEvent(event);
            canvasContextMenu.show(canvasPos[0], canvasPos[1]);
            event.preventDefault();
            event.stopPropagation();
        });

        //------------------------------------------------------------------------------------------------------------------
        // Create an DistanceMeasurementsPlugin, activate its DistanceMeasuremntsControl
        //------------------------------------------------------------------------------------------------------------------

        distanceMeasurementsPlugin.on("mouseOver", (e: any) => {
            if (endMeasurementEdit) {
                return;
            }
            e.distanceMeasurement.setHighlighted(true);
        });

        distanceMeasurementsPlugin.on("mouseLeave", (e: any) => {
            if (endMeasurementEdit) {
                return;
            }
            if (distanceMeasurementsContextMenu.shown && distanceMeasurementsContextMenu.context.distanceMeasurement.id === e.distanceMeasurement.id) {
                return;
            }
            e.distanceMeasurement.setHighlighted(false);
        });

        distanceMeasurementsPlugin.on("contextMenu", (e: any) => {
            if (endMeasurementEdit) {
                return;
            }
            distanceMeasurementsContextMenu.context = { // Must set context before showing menu
                viewer: viewer,
                distanceMeasurementsPlugin: distanceMeasurementsPlugin,
                distanceMeasurement: e.distanceMeasurement
            };
            distanceMeasurementsContextMenu.show(e.event.clientX, e.event.clientY);
            e.event.preventDefault();
        });

        const getCanvasPosFromEvent = function (event: any) {
            const canvasPos = [];
            if (!event) {
                event = window.event;
                canvasPos[0] = event.x;
                canvasPos[1] = event.y;
            } else {
                let element = event.target;
                let totalOffsetLeft = 0;
                let totalOffsetTop = 0;
                let totalScrollX = 0;
                let totalScrollY = 0;
                while (element.offsetParent) {
                    totalOffsetLeft += element.offsetLeft;
                    totalOffsetTop += element.offsetTop;
                    totalScrollX += element.scrollLeft;
                    totalScrollY += element.scrollTop;
                    element = element.offsetParent;
                }
                canvasPos[0] = event.pageX + totalScrollX - totalOffsetLeft;
                canvasPos[1] = event.pageY + totalScrollY - totalOffsetTop;
            }
            return canvasPos;
        };

        //window.viewer = viewer;

        //
        // const sectionPlane = sectionPlanes.createSectionPlane({
        //     id: "mySectionPlane",
        //     pos: [-2.20, 2.5, 2.3],
        //     dir: math.normalizeVec3([1.0, 0.01, 1])
        // });
    
        // window.sectionPlane = sectionPlane;
    
        // sectionPlanes.showControl(sectionPlane.id);
        //
        let isCaptureEnabled = false;
        let currentSectionPlane: any = null;

        handleSectionKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'U') {
            isCaptureEnabled = true;
          } else if (e.key === 'O') {
            if (currentSectionPlane) {
              sectionPlanes.removeSectionPlane(currentSectionPlane);
              currentSectionPlane = null;
              }
          }
        };

        handleSectionKeyUp = (e: KeyboardEvent) => {
          if (e.key === 'U') {
            isCaptureEnabled = false;
          }
        };

        document.addEventListener('keydown', handleSectionKeyDown);
        document.addEventListener('keyup', handleSectionKeyUp);

        viewer.scene.input.on("mouseclicked", (coords: any) => {
        if (!isCaptureEnabled) {
            return;
        }

        const pickResult = viewer.scene.pick({
            canvasPos: coords,
            pickSurface: true,
        });

        if (pickResult && pickResult.worldNormal) {
            if (pickResult.entity && !pickResult.entity.isObject) {
            return;
            }

            // Remove the existing section plane if it exists
            if (currentSectionPlane) {
            sectionPlanes.removeSectionPlane(currentSectionPlane);
            }

            currentSectionPlane = sectionPlanes.createSectionPlane({
            pos: pickResult.worldPos,
            dir: math.mulVec3Scalar(pickResult.worldNormal, -1)
            });

            sectionPlanes.showControl(currentSectionPlane.id);
        }
        });
        

        let lastEntity: any = null;
        let lastColorize: any = null;
        let lastLoggedHoverId: string | null = null;

        const publishHoveredObject = (entity: any) => {
          if (!entity?.isObject) {
            if (lastLoggedHoverId !== null) {
              lastLoggedHoverId = null;
            }
            viewerRegistry.setHoveredObject(null);
            return;
          }

          const metaObject = viewer.metaScene?.metaObjects?.[entity.id];
          const properties = (metaObject?.propertySets ?? []).flatMap((propertySet: any) =>
            (propertySet.properties ?? []).map((property: any) => ({
              setName: propertySet.name ?? null,
              name: property.name,
              value: property.value,
              valueType: property.valueType ?? null,
            })),
          );

          const aabb = entity.aabb;
          const hoverInfo: viewerRegistry.HoveredObjectInfo = {
            id: String(entity.id),
            name: metaObject?.name ?? null,
            type: metaObject?.type ?? null,
            originalSystemId: metaObject?.originalSystemId ?? null,
            parentId: metaObject?.parentId ? String(metaObject.parentId) : null,
            aabb: aabb && aabb.length >= 6
              ? [aabb[0], aabb[1], aabb[2], aabb[3], aabb[4], aabb[5]]
              : null,
            numTriangles: entity.numTriangles ?? null,
            attributes: metaObject?.attributes ?? {},
            properties,
          };

          viewerRegistry.setHoveredObject(hoverInfo);

          if (lastLoggedHoverId !== hoverInfo.id) {
            lastLoggedHoverId = hoverInfo.id;
          }
        };

        viewer.cameraControl.on("hover", (coords: any) => {
          const hit = coords?.entity;

          // O evento também pode ocorrer sobre espaço vazio, sem Entity.
          if (!hit || !hit.isObject) {
            if (lastEntity) {
              lastEntity.colorize = lastColorize;
              lastEntity = null;
              lastColorize = null;
            }
            publishHoveredObject(null);
            return;
          }

          if (!lastEntity || hit.id !== lastEntity.id) {
            if (lastEntity) {
              lastEntity.colorize = lastColorize;
            }
            lastEntity = hit;
            lastColorize = hit.colorize ? hit.colorize.slice() : [1.0, 1.0, 1.0];
            hit.colorize = [0.0, 1.0, 0.0];
          }
          publishHoveredObject(hit);
        });

        viewer.cameraControl.on("hoverOff", () => {
          if (lastEntity) {
            lastEntity.colorize = lastColorize;
          }
          lastEntity = null;
          lastColorize = null;
          publishHoveredObject(null);
        });

        // treeViewPlugin.on("nodeCheckboxChanged", (e: any) => {
        //   const objectId = e.objectId;
        //   const checked = e.checked;
        //   viewer.scene.setObjectsVisible([objectId], checked);
        // });

        viewerRef.current = viewer;
        const initialState = {
          camera: {
            eye: [viewer.camera.eye[0], viewer.camera.eye[1], viewer.camera.eye[2]],
            look: [viewer.camera.look[0], viewer.camera.look[1], viewer.camera.look[2]],
            up: [viewer.camera.up[0], viewer.camera.up[1], viewer.camera.up[2]],
            projection: viewer.camera.projection,
            fov: viewer.camera.perspective?.fov,
            orthoScale: viewer.camera.ortho?.scale,
          },
          visibleObjectIds: Array.from(viewer.scene.visibleObjectIds ?? []),
        };
        viewerRegistry.registerViewer(viewer, modelId, initialState);

      } catch (error) {
        console.error("Erro ao inicializar o viewer:", error);
        isInitialized = false;
      }
    };

    initializeViewer();

    return () => {
      isInitialized = false;
      if (handleMeasurementKeyDown) {
        document.removeEventListener('keydown', handleMeasurementKeyDown);
      }
      if (handleMeasurementKeyUp) {
        document.removeEventListener('keyup', handleMeasurementKeyUp);
      }
      if (handleSectionKeyDown) {
        document.removeEventListener('keydown', handleSectionKeyDown);
      }
      if (handleSectionKeyUp) {
        document.removeEventListener('keyup', handleSectionKeyUp);
      }

      if (viewerRef.current) {
        viewerRegistry.unregisterViewer(viewerRef.current);
        try {
          viewerRef.current.destroy();
        } catch (e) {
          console.warn("Erro ao destruir Viewer:", e);
        }
        viewerRef.current = null;
      }
    };
  }, [modelId, xktSrc, canvasRef]);

  return <></>;
};

export default XeokitViewer;