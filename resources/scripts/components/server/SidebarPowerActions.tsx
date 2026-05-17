import { Power } from '@gravity-ui/icons';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import Can from '@/components/elements/Can';
import { Dialog } from '@/components/elements/dialog';
import { PowerAction } from '@/components/server/console/ServerConsoleContainer';

import { ServerContext } from '@/state/server';

const SidebarPowerActions = () => {
    const [open, setOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState<PowerAction | null>(null);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);

    const killable = status === 'stopping';

    const actionLabels: Record<PowerAction, string> = {
        start: 'Start Server',
        restart: 'Restart Server',
        stop: 'Stop Server',
        kill: 'Forcibly Stop Process',
    };

    const actionDescriptions: Record<PowerAction, string> = {
        start: 'Start this server now?',
        restart: 'Restart this server now?',
        stop: 'Stop this server gracefully?',
        kill: 'Forcibly stopping a server can lead to data corruption.',
    };

    const requestPowerAction = (action: PowerAction): void => {
        setPendingAction(action);
        setOpen(true);
    };

    const confirmPowerAction = (): void => {
        if (!pendingAction) return;

        if (!instance) {
            toast.error('The server websocket is not connected.');
            return;
        }

        if (pendingAction === 'start') {
            toast.success('Your server is starting!');
        } else if (pendingAction === 'restart') {
            toast.success('Your server is restarting.');
        } else {
            toast.success('Your server is being stopped.');
        }

        setOpen(false);
        instance.send('set state', pendingAction);
        setPendingAction(null);
    };

    useEffect(() => {
        if (status === 'offline') {
            setOpen(false);
            setPendingAction(null);
        }
    }, [status]);

    if (!status) {
        return null;
    }

    const baseButtonClass =
        'h-9 min-w-0 flex-1 rounded-md border border-[#ffffff12] px-2 text-xs font-bold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-45';

    return (
        <div className='mb-4 rounded-lg border border-[#ffffff12] bg-[#ffffff08] p-2'>
            <Dialog.Confirm
                open={open}
                hideCloseIcon
                onClose={() => {
                    setOpen(false);
                    setPendingAction(null);
                }}
                title={pendingAction ? actionLabels[pendingAction] : 'Power Action'}
                confirm='Continue'
                onConfirmed={confirmPowerAction}
            >
                {pendingAction ? actionDescriptions[pendingAction] : 'Confirm this power action?'}
            </Dialog.Confirm>

            <div className='mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-zinc-400'>
                <Power fill='currentColor' width={14} height={14} />
                Power
            </div>
            <div className='flex gap-1.5'>
                <Can action='control.start'>
                    <button
                        className={baseButtonClass}
                        style={{
                            background:
                                status === 'offline'
                                    ? 'radial-gradient(109.26% 109.26% at 49.83% 13.37%, #FF343C 0%, #F06F53 100%)'
                                    : 'radial-gradient(124.75% 124.75% at 50.01% -10.55%, rgb(36, 36, 36) 0%, rgb(20, 20, 20) 100%)',
                        }}
                        disabled={status !== 'offline'}
                        onClick={() => requestPowerAction('start')}
                    >
                        Start
                    </button>
                </Can>
                <Can action='control.restart'>
                    <button
                        className={baseButtonClass}
                        style={{
                            background:
                                'radial-gradient(124.75% 124.75% at 50.01% -10.55%, rgb(36, 36, 36) 0%, rgb(20, 20, 20) 100%)',
                        }}
                        disabled={!status}
                        onClick={() => requestPowerAction('restart')}
                    >
                        Restart
                    </button>
                </Can>
                <Can action='control.stop'>
                    <button
                        className={baseButtonClass}
                        style={{
                            background:
                                status === 'offline'
                                    ? 'radial-gradient(124.75% 124.75% at 50.01% -10.55%, rgb(36, 36, 36) 0%, rgb(20, 20, 20) 100%)'
                                    : 'radial-gradient(109.26% 109.26% at 49.83% 13.37%, #FF343C 0%, #F06F53 100%)',
                        }}
                        disabled={status === 'offline'}
                        onClick={() => requestPowerAction(killable ? 'kill' : 'stop')}
                    >
                        {killable ? 'Kill' : 'Stop'}
                    </button>
                </Can>
            </div>
        </div>
    );
};

export default SidebarPowerActions;
