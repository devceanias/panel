import {
    Bars,
    ChevronDown,
    ChevronUp,
    Ellipsis,
    House,
    LayoutCellsLarge,
    Magnifier,
    Plus,
    SlidersVertical,
    TrashBin,
} from '@gravity-ui/icons';
import { useStoreState } from 'easy-peasy';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import useSWR from 'swr';

import ServerRow from '@/components/dashboard/ServerRow';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/elements/DropdownMenu';
import PageContentBlock from '@/components/elements/PageContentBlock';
import Pagination from '@/components/elements/Pagination';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/elements/Tabs';
import { PageListContainer } from '@/components/elements/pages/PageList';

import getServers from '@/api/getServers';
import { PaginatedResult } from '@/api/http';
import { Server } from '@/api/server/getServer';
import {
    ServerGroup,
    createServerGroup,
    deleteServerGroup,
    getServerGroups,
    reorderServerGroups,
    setServerGroupCollapsed,
} from '@/api/serverGroups';

import useFlash from '@/plugins/useFlash';
import { usePersistedState } from '@/plugins/usePersistedState';

import { MainPageHeader } from '../elements/MainPageHeader';

const DashboardContainer = () => {
    const getTitle = () => {
        if (serverViewMode === 'admin-all') return 'All Servers (Admin)';
        if (serverViewMode === 'all') return 'All Accessible Servers';
        return 'Your Servers';
    };

    const { search } = useLocation();
    const defaultPage = Number(new URLSearchParams(search).get('page') || '1');

    const [page, setPage] = useState(!isNaN(defaultPage) && defaultPage > 0 ? defaultPage : 1);
    const { clearFlashes, clearAndAddHttpError } = useFlash();
    const uuid = useStoreState((state) => state.user.data!.uuid);
    const rootAdmin = useStoreState((state) => state.user.data!.rootAdmin);
    // const showOnlyAdmin = usePersistedState(`${uuid}:show_all_servers`, false);

    const [serverViewMode, setServerViewMode] = usePersistedState<'owner' | 'admin-all' | 'all'>(
        `${uuid}:server_view_mode`,
        'owner',
    );

    const [dashboardDisplayOption, setDashboardDisplayOption] = usePersistedState(
        `${uuid}:dashboard_display_option`,
        'list',
    );
    const [serverSearch, setServerSearch] = usePersistedState(`${uuid}:server_search`, '');
    const getApiType = (): string | undefined => {
        if (serverViewMode === 'owner') return 'owner';
        if (serverViewMode === 'admin-all') return 'admin-all';
        if (serverViewMode === 'all') return 'all';
        return undefined;
    };

    const { data: servers, error, mutate: mutateServers } = useSWR<PaginatedResult<Server>>(
        ['/api/client/servers', serverViewMode, page, serverSearch],
        () => getServers({ page, type: getApiType(), query: serverSearch.trim() || undefined, perPage: 100 }),
        { revalidateOnFocus: false },
    );
    const { data: serverGroups, mutate: mutateServerGroups } = useSWR<ServerGroup[]>(
        '/api/client/server-groups',
        getServerGroups,
        { revalidateOnFocus: false },
    );

    useEffect(() => {
        if (!servers) return;
        if (servers.pagination.currentPage > 1 && !servers.items.length) {
            setPage(1);
        }
    }, [servers?.pagination.currentPage]);

    useEffect(() => {
        // Don't use react-router to handle changing this part of the URL, otherwise it
        // triggers a needless re-render. We just want to track this in the URL incase the
        // user refreshes the page.
        window.history.replaceState(null, document.title, `/${page <= 1 ? '' : `?page=${page}`}`);
    }, [page]);

    useEffect(() => {
        if (error) clearAndAddHttpError({ key: 'dashboard', error });
        if (!error) clearFlashes('dashboard');
    }, [error]);

    useEffect(() => {
        setPage(1);
    }, [serverSearch, serverViewMode]);

    const groupedServers = useMemo(() => {
        const groups = (serverGroups || []).map((group) => ({
            ...group,
            servers: [] as Server[],
        }));
        const groupsById = new Map<number, (typeof groups)[number]>();
        groups.forEach((group) => groupsById.set(group.id, group));

        const ungrouped = {
            id: null,
            name: 'Ungrouped',
            position: Number.MAX_SAFE_INTEGER,
            collapsed: false,
            servers: [] as Server[],
        };

        (servers?.items || []).forEach((server) => {
            const groupId = server.dashboardGroup?.id || null;
            const group = groupId ? groupsById.get(groupId) : null;
            (group || ungrouped).servers.push(server);
        });

        groups.forEach((group) => {
            group.servers.sort((a, b) => a.dashboardPosition - b.dashboardPosition || a.name.localeCompare(b.name));
        });
        ungrouped.servers.sort((a, b) => a.dashboardPosition - b.dashboardPosition || a.name.localeCompare(b.name));

        return [...groups, ungrouped].filter((group) => rootAdmin || group.servers.length > 0);
    }, [serverGroups, servers?.items, rootAdmin]);

    const persistServerOrder = async (nextGroups: typeof groupedServers) => {
        await reorderServerGroups({
            groups: nextGroups
                .filter((group) => group.id !== null)
                .map((group, position) => ({ id: group.id!, position })),
            servers: nextGroups.flatMap((group) =>
                group.servers.map((server, position) => ({
                    id: server.internalId,
                    groupId: group.id,
                    position,
                })),
            ),
        });

        await mutateServers();
        await mutateServerGroups();
    };

    const moveServer = async (server: Server, direction: -1 | 1) => {
        const nextGroups = groupedServers.map((group) => ({ ...group, servers: [...group.servers] }));
        const group = nextGroups.find((group) => group.servers.some((item) => item.uuid === server.uuid));
        if (!group) return;

        const index = group.servers.findIndex((item) => item.uuid === server.uuid);
        const target = index + direction;
        if (target < 0 || target >= group.servers.length) return;

        const [item] = group.servers.splice(index, 1);
        group.servers.splice(target, 0, item);

        await persistServerOrder(nextGroups);
    };

    const moveServerToGroup = async (server: Server, groupId: number | null) => {
        const nextGroups = groupedServers.map((group) => ({ ...group, servers: [...group.servers] }));
        const currentGroup = nextGroups.find((group) => group.servers.some((item) => item.uuid === server.uuid));
        const targetGroup = nextGroups.find((group) => group.id === groupId);
        if (!currentGroup || !targetGroup) return;

        currentGroup.servers = currentGroup.servers.filter((item) => item.uuid !== server.uuid);
        targetGroup.servers.push(server);

        await persistServerOrder(nextGroups);
    };

    const createGroup = async () => {
        const name = window.prompt('Group name');
        if (!name?.trim()) return;

        await createServerGroup(name.trim());
        await mutateServerGroups();
    };

    const removeGroup = async (group: { id: number; name: string }) => {
        if (!window.confirm(`Remove the "${group.name}" group? Servers in it will move to Ungrouped.`)) return;

        await deleteServerGroup(group.id);
        await mutateServers();
        await mutateServerGroups();
    };

    const toggleGroup = async (group: { id: number; collapsed: boolean }) => {
        await setServerGroupCollapsed(group.id, !group.collapsed);
        await mutateServerGroups(
            (groups) => groups?.map((item) => (item.id === group.id ? { ...item, collapsed: !group.collapsed } : item)),
            false,
        );
    };

    const serverControls = (server: Server, groupServers: Server[]) => {
        if (!rootAdmin) return null;

        const currentGroupId = server.dashboardGroup?.id || null;
        const index = groupServers.findIndex((item) => item.uuid === server.uuid);

        return (
            <div className='flex items-center gap-1'>
                <button
                    className='h-8 w-8 rounded-md bg-[#ffffff11] text-zinc-200 transition hover:bg-[#ffffff22] disabled:opacity-40'
                    disabled={index <= 0}
                    onClick={(event) => {
                        event.preventDefault();
                        void moveServer(server, -1);
                    }}
                    aria-label='Move server up'
                >
                    <ChevronUp width={16} height={16} className='mx-auto' fill='currentColor' />
                </button>
                <button
                    className='h-8 w-8 rounded-md bg-[#ffffff11] text-zinc-200 transition hover:bg-[#ffffff22] disabled:opacity-40'
                    disabled={index === groupServers.length - 1}
                    onClick={(event) => {
                        event.preventDefault();
                        void moveServer(server, 1);
                    }}
                    aria-label='Move server down'
                >
                    <ChevronDown width={16} height={16} className='mx-auto' fill='currentColor' />
                </button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            className='h-8 w-8 rounded-md bg-[#ffffff11] text-zinc-200 transition hover:bg-[#ffffff22]'
                            aria-label='Server group actions'
                            onClick={(event) => event.preventDefault()}
                        >
                            <Ellipsis width={18} height={18} className='mx-auto' fill='currentColor' />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className='z-99999' sideOffset={8}>
                        <DropdownMenuItem
                            disabled={currentGroupId === null}
                            onSelect={() => void moveServerToGroup(server, null)}
                        >
                            Move to Ungrouped
                        </DropdownMenuItem>
                        {(serverGroups || []).map((group) => (
                            <DropdownMenuItem
                                key={group.id}
                                disabled={currentGroupId === group.id}
                                onSelect={() => void moveServerToGroup(server, group.id)}
                            >
                                Move to {group.name}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        );
    };

    return (
        <PageContentBlock title={'Dashboard'} showFlashKey={'dashboard'}>
            <div className='w-full h-full min-h-full flex-1 flex flex-col px-2 sm:px-0'>
                <Tabs
                    defaultValue={dashboardDisplayOption}
                    onValueChange={(value) => {
                        setDashboardDisplayOption(value);
                    }}
                    className='w-full'
                >
                    <div
                        className='transform-gpu skeleton-anim-2 mb-3 sm:mb-4'
                        style={{
                            animationDelay: '50ms',
                            animationTimingFunction:
                                'linear(0,0.01,0.04 1.6%,0.161 3.3%,0.816 9.4%,1.046,1.189 14.4%,1.231,1.254 17%,1.259,1.257 18.6%,1.236,1.194 22.3%,1.057 27%,0.999 29.4%,0.955 32.1%,0.942,0.935 34.9%,0.933,0.939 38.4%,1 47.3%,1.011,1.017 52.6%,1.016 56.4%,1 65.2%,0.996 70.2%,1.001 87.2%,1)',
                        }}
                    >
                        <MainPageHeader
                            title={getTitle()}
                            titleChildren={
                                <div className='flex flex-wrap justify-end gap-3'>
                                    <div className='relative h-9 min-w-56'>
                                        <Magnifier
                                            width={16}
                                            height={16}
                                            className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#ffffff66]'
                                            fill='currentColor'
                                        />
                                        <input
                                            className='h-9 w-full rounded-md border border-[#ffffff12] bg-[#ffffff11] pl-9 pr-3 text-sm text-zinc-100 outline-none transition placeholder:text-[#ffffff55] focus:border-brand/60 focus:bg-[#ffffff18]'
                                            value={serverSearch}
                                            onChange={(event) => setServerSearch(event.target.value)}
                                            placeholder='Search servers'
                                        />
                                    </div>
                                    {rootAdmin && (
                                        <button
                                            className='inline-flex h-9 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[#ffffff11] px-3 py-1.5 text-sm font-medium text-[#ffffff88] transition-all hover:bg-[#ffffff23] hover:text-[#ffffff] focus-visible:outline-hidden'
                                            onClick={() => void createGroup()}
                                        >
                                            <Plus width={18} height={18} fill='currentColor' />
                                            Group
                                        </button>
                                    )}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button className='inline-flex h-9 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[#ffffff11] px-3 py-1.5 text-sm font-medium text-[#ffffff88] transition-all hover:bg-[#ffffff23] hover:text-[#ffffff] focus-visible:outline-hidden'>
                                                <SlidersVertical width={20} height={21} color='white' />
                                                <div>{getTitle()}</div>
                                                <ChevronDown width={13} height={13} color='white' />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className='flex flex-col gap-1 z-99999' sideOffset={8}>
                                            <DropdownMenuItem
                                                onSelect={() => setServerViewMode('owner')}
                                                className={serverViewMode === 'owner' ? 'bg-accent/20' : ''}
                                            >
                                                Your Servers Only
                                            </DropdownMenuItem>

                                            {rootAdmin && (
                                                <>
                                                    <DropdownMenuItem
                                                        onSelect={() => setServerViewMode('admin-all')}
                                                        className={serverViewMode === 'admin-all' ? 'bg-accent/20' : ''}
                                                    >
                                                        All Servers (Admin)
                                                    </DropdownMenuItem>
                                                </>
                                            )}
                                            <DropdownMenuItem
                                                onSelect={() => setServerViewMode('all')}
                                                className={serverViewMode === 'all' ? 'bg-accent/20' : ''}
                                            >
                                                All Servers
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>

                                    <TabsList>
                                        <TabsTrigger aria-label='View servers in a list layout.' value='list'>
                                            <Bars width={18} height={20} color='white' />
                                        </TabsTrigger>
                                        <TabsTrigger aria-label='View servers in a grid layout.' value='grid'>
                                            <LayoutCellsLarge width={20} height={20} color='white' />
                                        </TabsTrigger>
                                    </TabsList>
                                </div>
                            }
                        />
                    </div>
                    {!servers ? (
                        <div className='flex items-center justify-center py-12'>
                            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-brand'></div>
                        </div>
                    ) : (
                        <>
                            <TabsContent value='list'>
                                <Pagination data={servers} onPageSelect={setPage}>
                                    {({ items }) =>
                                        items.length > 0 ? (
                                            <div className='flex flex-col gap-4'>
                                                {groupedServers.map((group, groupIndex) => (
                                                    <Fragment key={group.id ?? 'ungrouped'}>
                                                        {(group.id !== null || group.servers.length > 0) && (
                                                            <div className='flex items-center justify-between rounded-lg border border-[#ffffff12] bg-[#ffffff08] px-4 py-3'>
                                                                <button
                                                                    className='flex min-w-0 items-center gap-2 text-left'
                                                                    disabled={group.id === null}
                                                                    onClick={() => {
                                                                        if (group.id !== null) void toggleGroup(group);
                                                                    }}
                                                                >
                                                                    {group.id !== null &&
                                                                        (group.collapsed ? (
                                                                            <ChevronDown
                                                                                width={16}
                                                                                height={16}
                                                                                fill='currentColor'
                                                                            />
                                                                        ) : (
                                                                            <ChevronUp
                                                                                width={16}
                                                                                height={16}
                                                                                fill='currentColor'
                                                                            />
                                                                        ))}
                                                                    <span className='truncate text-sm font-bold text-zinc-100'>
                                                                        {group.name}
                                                                    </span>
                                                                    <span className='text-xs text-zinc-500'>
                                                                        {group.servers.length}
                                                                    </span>
                                                                </button>
                                                                {rootAdmin && group.id !== null && (
                                                                    <button
                                                                        className='h-8 w-8 rounded-md bg-[#ffffff11] text-zinc-200 transition hover:bg-red-500/25'
                                                                        onClick={() => void removeGroup(group)}
                                                                        aria-label='Remove group'
                                                                    >
                                                                        <TrashBin width={16} height={16} className='mx-auto' fill='currentColor' />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                        {!group.collapsed && group.servers.length > 0 && (
                                                            <PageListContainer>
                                                                {group.servers.map((server, index) => (
                                                                    <div
                                                                        key={server.uuid}
                                                                        className='transform-gpu skeleton-anim-2'
                                                                        style={{
                                                                            animationDelay: `${(groupIndex + index) * 50 + 50}ms`,
                                                                            animationTimingFunction:
                                                                                'linear(0,0.01,0.04 1.6%,0.161 3.3%,0.816 9.4%,1.046,1.189 14.4%,1.231,1.254 17%,1.259,1.257 18.6%,1.236,1.194 22.3%,1.057 27%,0.999 29.4%,0.955 32.1%,0.942,0.935 34.9%,0.933,0.939 38.4%,1 47.3%,1.011,1.017 52.6%,1.016 56.4%,1 65.2%,0.996 70.2%,1.001 87.2%,1)',
                                                                        }}
                                                                    >
                                                                        <div className='flex items-center gap-3'>
                                                                            <ServerRow className='min-w-0 flex-1 flex-row' server={server} />
                                                                            <div className='shrink-0'>
                                                                                {serverControls(server, group.servers)}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </PageListContainer>
                                                        )}
                                                    </Fragment>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className='flex flex-col items-center justify-center py-12 px-4'>
                                                <div className='text-center'>
                                                    <div className='w-16 h-16 mx-auto mb-4 rounded-full bg-[#ffffff11] flex items-center justify-center'>
                                                        <House width={28} height={28} color='white' />
                                                    </div>
                                                    <h3 className='text-lg font-medium text-zinc-200 mb-2'>
                                                        {serverSearch.trim()
                                                            ? 'No matching servers'
                                                            : serverViewMode === 'admin-all'
                                                            ? 'No other servers found'
                                                            : 'No servers found'}
                                                    </h3>
                                                    <p className='text-sm text-zinc-400 max-w-sm'>
                                                        {serverSearch.trim()
                                                            ? 'Try a different server name, UUID, description, or external ID.'
                                                            : serverViewMode === 'admin-all'
                                                            ? 'There are no other servers to display.'
                                                            : 'There are no servers associated with your account.'}
                                                    </p>
                                                </div>
                                            </div>
                                        )
                                    }
                                </Pagination>
                            </TabsContent>
                            <TabsContent value='grid'>
                                <Pagination data={servers} onPageSelect={setPage}>
                                    {({ items }) =>
                                        items.length > 0 ? (
                                            <div className='flex flex-col gap-4'>
                                                {groupedServers.map((group, groupIndex) => (
                                                    <Fragment key={group.id ?? 'ungrouped'}>
                                                        {(group.id !== null || group.servers.length > 0) && (
                                                            <div className='flex items-center justify-between rounded-lg border border-[#ffffff12] bg-[#ffffff08] px-4 py-3'>
                                                                <button
                                                                    className='flex min-w-0 items-center gap-2 text-left'
                                                                    disabled={group.id === null}
                                                                    onClick={() => {
                                                                        if (group.id !== null) void toggleGroup(group);
                                                                    }}
                                                                >
                                                                    {group.id !== null &&
                                                                        (group.collapsed ? (
                                                                            <ChevronDown
                                                                                width={16}
                                                                                height={16}
                                                                                fill='currentColor'
                                                                            />
                                                                        ) : (
                                                                            <ChevronUp
                                                                                width={16}
                                                                                height={16}
                                                                                fill='currentColor'
                                                                            />
                                                                        ))}
                                                                    <span className='truncate text-sm font-bold text-zinc-100'>
                                                                        {group.name}
                                                                    </span>
                                                                    <span className='text-xs text-zinc-500'>
                                                                        {group.servers.length}
                                                                    </span>
                                                                </button>
                                                                {rootAdmin && group.id !== null && (
                                                                    <button
                                                                        className='h-8 w-8 rounded-md bg-[#ffffff11] text-zinc-200 transition hover:bg-red-500/25'
                                                                        onClick={() => void removeGroup(group)}
                                                                        aria-label='Remove group'
                                                                    >
                                                                        <TrashBin width={16} height={16} className='mx-auto' fill='currentColor' />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                        {!group.collapsed && group.servers.length > 0 && (
                                                            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                                                {group.servers.map((server, index) => (
                                                                    <div
                                                                        key={server.uuid}
                                                                        className='transform-gpu skeleton-anim-2'
                                                                        style={{
                                                                            animationDelay: `${(groupIndex + index) * 50 + 50}ms`,
                                                                            animationTimingFunction:
                                                                                'linear(0,0.01,0.04 1.6%,0.161 3.3%,0.816 9.4%,1.046,1.189 14.4%,1.231,1.254 17%,1.259,1.257 18.6%,1.236,1.194 22.3%,1.057 27%,0.999 29.4%,0.955 32.1%,0.942,0.935 34.9%,0.933,0.939 38.4%,1 47.3%,1.011,1.017 52.6%,1.016 56.4%,1 65.2%,0.996 70.2%,1.001 87.2%,1)',
                                                                        }}
                                                                    >
                                                                        <div className='flex flex-col gap-2'>
                                                                            <div className='flex justify-end'>
                                                                                {serverControls(server, group.servers)}
                                                                            </div>
                                                                            <ServerRow
                                                                                className='items-start! flex-col w-full gap-4 [&>div~div]:w-full'
                                                                                server={server}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </Fragment>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className='flex flex-col items-center justify-center py-12 px-4'>
                                                <div className='text-center'>
                                                    <div className='w-16 h-16 mx-auto mb-4 rounded-full bg-[#ffffff11] flex items-center justify-center'>
                                                        <House width={28} height={28} color='white' />
                                                    </div>
                                                    <h3 className='text-lg font-medium text-zinc-200 mb-2'>
                                                        {serverSearch.trim()
                                                            ? 'No matching servers'
                                                            : serverViewMode === 'admin-all'
                                                            ? 'No other servers found'
                                                            : 'No servers found'}
                                                    </h3>
                                                    <p className='text-sm text-zinc-400 max-w-sm'>
                                                        {serverSearch.trim()
                                                            ? 'Try a different server name, UUID, description, or external ID.'
                                                            : serverViewMode === 'admin-all'
                                                            ? 'There are no other servers to display.'
                                                            : 'There are no servers associated with your account.'}
                                                    </p>
                                                </div>
                                            </div>
                                        )
                                    }
                                </Pagination>
                            </TabsContent>
                        </>
                    )}
                </Tabs>
            </div>
        </PageContentBlock>
    );
};

export default DashboardContainer;
