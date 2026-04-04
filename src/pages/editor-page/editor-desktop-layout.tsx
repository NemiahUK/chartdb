import React from 'react';
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from '@/components/resizable/resizable';
import { SidePanel } from './side-panel/side-panel';
import { Canvas } from './canvas/canvas';
import { useLayout } from '@/hooks/use-layout';
import type { Diagram } from '@/lib/domain/diagram';
import { cn } from '@/lib/utils';
import { SidebarProvider } from '@/components/sidebar/sidebar';
import { EditorSidebar } from './editor-sidebar/editor-sidebar';
import { TopNavbar } from './top-navbar/top-navbar';
import type {
    ImperativePanelGroupHandle,
    ImperativePanelHandle,
} from 'react-resizable-panels';

const SIDE_PANEL_WIDTH_STORAGE_KEY = 'editor_side_panel_width_px';
const DEFAULT_SIDE_PANEL_WIDTH_PX = 300;
const MIN_SIDE_PANEL_WIDTH_PX = 300;
const MAX_SIDE_PANEL_SIZE = 99;

const loadSavedSidePanelWidth = () => {
    if (typeof window === 'undefined') {
        return DEFAULT_SIDE_PANEL_WIDTH_PX;
    }

    const savedWidth = Number.parseFloat(
        window.localStorage.getItem(SIDE_PANEL_WIDTH_STORAGE_KEY) ?? ''
    );

    if (Number.isNaN(savedWidth)) {
        return DEFAULT_SIDE_PANEL_WIDTH_PX;
    }

    return Math.max(MIN_SIDE_PANEL_WIDTH_PX, savedWidth);
};

const getInitialPanelGroupWidth = () => {
    if (typeof window === 'undefined') {
        return 0;
    }

    return window.innerWidth;
};

const widthPxToPanelPercent = ({
    widthPx,
    containerWidth,
}: {
    widthPx: number;
    containerWidth: number;
}) => {
    if (containerWidth <= 0) {
        return MAX_SIDE_PANEL_SIZE;
    }

    const minPercent = Math.min(
        MAX_SIDE_PANEL_SIZE,
        (MIN_SIDE_PANEL_WIDTH_PX / containerWidth) * 100
    );
    const preferredPercent = (widthPx / containerWidth) * 100;

    return Math.min(
        MAX_SIDE_PANEL_SIZE,
        Math.max(minPercent, preferredPercent)
    );
};

const panelPercentToWidthPx = ({
    percent,
    containerWidth,
}: {
    percent: number;
    containerWidth: number;
}) => {
    if (containerWidth <= 0) {
        return MIN_SIDE_PANEL_WIDTH_PX;
    }

    return Math.max(MIN_SIDE_PANEL_WIDTH_PX, (percent / 100) * containerWidth);
};

export interface EditorDesktopLayoutProps {
    initialDiagram?: Diagram;
}
export const EditorDesktopLayout: React.FC<EditorDesktopLayoutProps> = ({
    initialDiagram,
}) => {
    const { isSidePanelShowed } = useLayout();
    const panelGroupRef = React.useRef<ImperativePanelGroupHandle>(null);
    const sidePanelRef = React.useRef<ImperativePanelHandle>(null);
    const panelGroupContainerRef = React.useRef<HTMLDivElement>(null);
    const previousIsSidePanelShowedRef = React.useRef(isSidePanelShowed);
    const [panelGroupWidth, setPanelGroupWidth] = React.useState(
        getInitialPanelGroupWidth
    );
    const [savedSidePanelWidth, setSavedSidePanelWidth] = React.useState(
        loadSavedSidePanelWidth
    );

    const persistSidePanelWidth = React.useCallback(
        (nextSidePanelWidth: number) => {
            const clampedWidth = Math.max(
                MIN_SIDE_PANEL_WIDTH_PX,
                nextSidePanelWidth
            );

            setSavedSidePanelWidth(clampedWidth);
            window.localStorage.setItem(
                SIDE_PANEL_WIDTH_STORAGE_KEY,
                clampedWidth.toString()
            );
        },
        []
    );

    React.useEffect(() => {
        const container = panelGroupContainerRef.current;

        if (!container) {
            return;
        }

        const updateWidth = () => {
            setPanelGroupWidth(container.getBoundingClientRect().width);
        };

        updateWidth();

        const observer = new ResizeObserver(() => {
            updateWidth();
        });

        observer.observe(container);

        return () => {
            observer.disconnect();
        };
    }, []);

    React.useEffect(() => {
        const previousIsSidePanelShowed = previousIsSidePanelShowedRef.current;

        if (previousIsSidePanelShowed && !isSidePanelShowed) {
            const currentLayout = panelGroupRef.current?.getLayout();
            const currentSidePanelSize = currentLayout?.[0];

            if (currentSidePanelSize && currentSidePanelSize > 0) {
                persistSidePanelWidth(
                    panelPercentToWidthPx({
                        percent: currentSidePanelSize,
                        containerWidth: panelGroupWidth,
                    })
                );
            }
        }

        previousIsSidePanelShowedRef.current = isSidePanelShowed;
    }, [isSidePanelShowed, panelGroupWidth, persistSidePanelWidth]);

    React.useEffect(() => {
        if (!isSidePanelShowed || panelGroupWidth <= 0) {
            return;
        }

        const nextSidePanelSize = widthPxToPanelPercent({
            widthPx: savedSidePanelWidth,
            containerWidth: panelGroupWidth,
        });
        const nextLayout = [nextSidePanelSize, 100 - nextSidePanelSize];
        const restoreLayout = () => {
            sidePanelRef.current?.resize(nextSidePanelSize);
            panelGroupRef.current?.setLayout(nextLayout);
        };

        restoreLayout();
        window.requestAnimationFrame(restoreLayout);
    }, [isSidePanelShowed, panelGroupWidth, savedSidePanelWidth]);

    const handleLayoutChange = React.useCallback(
        (layout: number[]) => {
            if (!isSidePanelShowed || panelGroupWidth <= 0) {
                return;
            }

            const [nextSidePanelSize] = layout;

            if (!nextSidePanelSize) {
                return;
            }

            persistSidePanelWidth(
                panelPercentToWidthPx({
                    percent: nextSidePanelSize,
                    containerWidth: panelGroupWidth,
                })
            );
        },
        [isSidePanelShowed, panelGroupWidth, persistSidePanelWidth]
    );

    const defaultSidePanelSize = React.useMemo(
        () =>
            widthPxToPanelPercent({
                widthPx: savedSidePanelWidth,
                containerWidth: panelGroupWidth,
            }),
        [panelGroupWidth, savedSidePanelWidth]
    );

    const minSidePanelSize = React.useMemo(
        () =>
            isSidePanelShowed && panelGroupWidth > 0
                ? widthPxToPanelPercent({
                      widthPx: MIN_SIDE_PANEL_WIDTH_PX,
                      containerWidth: panelGroupWidth,
                  })
                : 0,
        [isSidePanelShowed, panelGroupWidth]
    );

    return (
        <>
            <TopNavbar />
            <SidebarProvider
                defaultOpen={false}
                open={false}
                className="h-full min-h-0"
            >
                <EditorSidebar />
                <div
                    className="size-full min-h-0 flex-1"
                    ref={panelGroupContainerRef}
                >
                    <ResizablePanelGroup
                        ref={panelGroupRef}
                        direction="horizontal"
                        onLayout={handleLayoutChange}
                    >
                        <ResizablePanel
                            ref={sidePanelRef}
                            id="editor-side-panel"
                            order={1}
                            defaultSize={defaultSidePanelSize}
                            minSize={minSidePanelSize}
                            maxSize={
                                isSidePanelShowed ? MAX_SIDE_PANEL_SIZE : 0
                            }
                            className={cn(
                                'transition-[flex-grow] duration-200',
                                {
                                    'min-w-[300px]': isSidePanelShowed,
                                }
                            )}
                        >
                            <SidePanel />
                        </ResizablePanel>
                        <ResizableHandle
                            disabled={!isSidePanelShowed}
                            className={!isSidePanelShowed ? 'hidden' : ''}
                        />
                        <ResizablePanel
                            id="editor-canvas-panel"
                            order={2}
                            defaultSize={75}
                        >
                            <Canvas
                                initialTables={initialDiagram?.tables ?? []}
                            />
                        </ResizablePanel>
                    </ResizablePanelGroup>
                </div>
            </SidebarProvider>
        </>
    );
};

export default EditorDesktopLayout;
