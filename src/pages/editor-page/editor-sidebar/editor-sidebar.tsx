import React, { useMemo } from 'react';
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/sidebar/sidebar';
import { Group, FileType, Plus, FolderOpen, CodeXml } from 'lucide-react';
import { Table, Workflow } from 'lucide-react';
import { useLayout } from '@/hooks/use-layout';
import { useTranslation } from 'react-i18next';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import ChartDBLogo from '@/assets/logo-light.png';
import ChartDBDarkLogo from '@/assets/logo-dark.png';
import { useTheme } from '@/hooks/use-theme';
import { useChartDB } from '@/hooks/use-chartdb';
import { supportsCustomTypes } from '@/lib/domain/database-capabilities';
import { useDialog } from '@/hooks/use-dialog';
import { Separator } from '@/components/separator/separator';

export interface SidebarItem {
    title: string;
    icon: React.FC;
    onClick: () => void;
    active: boolean;
    badge?: string;
}

export interface EditorSidebarProps {}

export const EditorSidebar: React.FC<EditorSidebarProps> = () => {
    const {
        selectSidebarSection,
        selectedSidebarSection,
        hideSidePanel,
        isSidePanelShowed,
        showSidePanel,
        selectVisualsTab,
    } = useLayout();
    const { t } = useTranslation();
    const { isMd: isDesktop } = useBreakpoint('md');
    const { effectiveTheme } = useTheme();
    const { databaseType, repositoryMode } = useChartDB();
    const { openCreateDiagramDialog, openOpenDiagramDialog } = useDialog();

    const toggleSidebarSection = React.useCallback(
        (section: 'tables' | 'dbml' | 'refs' | 'customTypes' | 'visuals') => {
            const isActiveSection =
                isSidePanelShowed && selectedSidebarSection === section;

            if (isActiveSection) {
                hideSidePanel();
                return;
            }

            showSidePanel();
            selectSidebarSection(section);

            if (section === 'visuals') {
                selectVisualsTab('areas');
            }
        },
        [
            hideSidePanel,
            isSidePanelShowed,
            selectSidebarSection,
            selectVisualsTab,
            selectedSidebarSection,
            showSidePanel,
        ]
    );

    const diagramItems: SidebarItem[] = useMemo(
        () => [
            {
                title: t('editor_sidebar.new_diagram'),
                icon: Plus,
                onClick: () => {
                    openCreateDiagramDialog();
                },
                active: false,
            },
            {
                title: t('editor_sidebar.browse'),
                icon: FolderOpen,
                onClick: () => {
                    openOpenDiagramDialog();
                },
                active: false,
            },
        ],
        [t, openCreateDiagramDialog, openOpenDiagramDialog]
    );

    const baseItems: SidebarItem[] = useMemo(
        () => [
            {
                title: t('editor_sidebar.tables'),
                icon: Table,
                onClick: () => toggleSidebarSection('tables'),
                active:
                    isSidePanelShowed && selectedSidebarSection === 'tables',
            },
            {
                title: 'DBML',
                icon: CodeXml,
                onClick: () => toggleSidebarSection('dbml'),
                active: isSidePanelShowed && selectedSidebarSection === 'dbml',
            },
            {
                title: t('editor_sidebar.refs'),
                icon: Workflow,
                onClick: () => toggleSidebarSection('refs'),
                active: isSidePanelShowed && selectedSidebarSection === 'refs',
            },
            ...(supportsCustomTypes(databaseType)
                ? [
                      {
                          title: t('editor_sidebar.custom_types'),
                          icon: FileType,
                          onClick: () => toggleSidebarSection('customTypes'),
                          active:
                              isSidePanelShowed &&
                              selectedSidebarSection === 'customTypes',
                      },
                  ]
                : []),
            {
                title: t('editor_sidebar.visuals'),
                icon: Group,
                onClick: () => toggleSidebarSection('visuals'),
                active:
                    isSidePanelShowed && selectedSidebarSection === 'visuals',
            },
        ],
        [
            t,
            databaseType,
            isSidePanelShowed,
            selectedSidebarSection,
            toggleSidebarSection,
        ]
    );

    return (
        <Sidebar
            side="left"
            collapsible="icon-extended"
            variant="sidebar"
            className="relative h-full"
        >
            {!isDesktop ? (
                <SidebarHeader>
                    <span title="ChartDB — open-source database diagrams">
                        <img
                            src={
                                effectiveTheme === 'light'
                                    ? ChartDBLogo
                                    : ChartDBDarkLogo
                            }
                            alt="chartDB"
                            className="h-4 max-w-fit"
                        />
                    </span>
                </SidebarHeader>
            ) : null}
            <SidebarContent>
                <SidebarGroup>
                    {/* <SidebarGroupLabel /> */}
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {(repositoryMode ? [] : diagramItems).map(
                                (item) => (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton
                                            className="justify-center space-y-0.5 !px-0 hover:bg-gray-200 data-[active=true]:bg-gray-100 data-[active=true]:text-pink-600 data-[active=true]:hover:bg-pink-100 dark:hover:bg-gray-800 dark:data-[active=true]:bg-gray-900 dark:data-[active=true]:text-pink-400 dark:data-[active=true]:hover:bg-pink-950"
                                            isActive={item.active}
                                            asChild
                                        >
                                            <button onClick={item.onClick}>
                                                <item.icon />
                                                <span>
                                                    {item.title
                                                        .split(' ')
                                                        .map((word, index) => (
                                                            <div key={index}>
                                                                {word}
                                                            </div>
                                                        ))}
                                                </span>
                                            </button>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                )
                            )}
                        </SidebarMenu>
                        <Separator className="my-2" />
                        <SidebarMenu>
                            {baseItems.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton
                                        className="justify-center space-y-0.5 !px-0 hover:bg-gray-200 data-[active=true]:bg-gray-100 data-[active=true]:text-pink-600 data-[active=true]:hover:bg-pink-100 dark:hover:bg-gray-800 dark:data-[active=true]:bg-gray-900 dark:data-[active=true]:text-pink-400 dark:data-[active=true]:hover:bg-pink-950"
                                        isActive={item.active}
                                        asChild
                                    >
                                        <button onClick={item.onClick}>
                                            <item.icon />
                                            <span>
                                                {item.title
                                                    .split(' ')
                                                    .map((word, index) => (
                                                        <div key={index}>
                                                            {word}
                                                        </div>
                                                    ))}
                                            </span>
                                        </button>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    );
};
