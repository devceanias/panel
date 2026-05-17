import http from '@/api/http';

export interface ServerGroup {
    id: number;
    name: string;
    position: number;
    collapsed: boolean;
}

export interface ServerOrderPayload {
    groups?: Array<{
        id: number;
        position: number;
    }>;
    servers?: Array<{
        id: number | string;
        groupId: number | null;
        position: number;
    }>;
}

export const getServerGroups = async (): Promise<ServerGroup[]> => {
    const { data } = await http.get('/api/client/server-groups');
    return data.data || [];
};

export const createServerGroup = async (name: string): Promise<ServerGroup> => {
    const { data } = await http.post('/api/client/server-groups', { name });
    return data;
};

export const deleteServerGroup = async (id: number): Promise<void> => {
    await http.delete(`/api/client/server-groups/${id}`);
};

export const reorderServerGroups = async (payload: ServerOrderPayload): Promise<void> => {
    await http.post('/api/client/server-groups/order', payload);
};

export const setServerGroupCollapsed = async (id: number, collapsed: boolean): Promise<void> => {
    await http.put(`/api/client/server-groups/${id}/collapsed`, { collapsed });
};
