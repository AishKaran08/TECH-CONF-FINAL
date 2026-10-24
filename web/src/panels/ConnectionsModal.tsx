import type { Dashboard } from '@runway/shared';
import { Modal } from '../components/ui';
import { closeConnections, usePanels } from './panelState';

export function ConnectionsModal({ d: _d }: { d: Dashboard | null }) {
  const { connections } = usePanels();
  return (
    <Modal open={connections !== null} onClose={closeConnections} title="Connections" wide>
      <p className="text-sm text-zinc-400">Connections arrive in the next milestone.</p>
    </Modal>
  );
}
