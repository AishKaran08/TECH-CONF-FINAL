import { Modal } from '../components/ui';
import { closeAgent, usePanels } from './panelState';

export function AgentPalette() {
  const { agent } = usePanels();
  return (
    <Modal open={agent} onClose={closeAgent} title="Agent">
      <p className="text-sm text-zinc-400">The agent arrives in a later milestone.</p>
    </Modal>
  );
}
