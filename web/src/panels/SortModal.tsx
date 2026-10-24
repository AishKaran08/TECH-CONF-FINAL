import { Modal } from '../components/ui';
import { closeSort, usePanels } from './panelState';

export function SortModal() {
  const { sort } = usePanels();
  return (
    <Modal open={sort} onClose={closeSort} title="Smart sort">
      <p className="text-sm text-zinc-400">Smart sort arrives in a later milestone.</p>
    </Modal>
  );
}
