import { useSyncExternalStore } from 'react';
import type { PublicSettings } from '@runway/shared';
import { Button, Modal } from '../components/ui';
import { api } from '../lib/api';
import { getState, refresh } from '../lib/store';

let pending: ((ok: boolean) => void) | null = null;
let open = false;
const ls = new Set<() => void>();
const setOpen = (v: boolean) => {
  open = v;
  ls.forEach((l) => l());
};

/**
 * Resolves true when the action may continue. Shows the one-time privacy notice the first time
 * an AI feature is used. If AI is off (no key or Local only), it resolves true at once and the
 * server uses the local fallback.
 */
export function requireAiNotice(): Promise<boolean> {
  const s = getState().dashboard?.settings;
  if (!s || !s.aiAvailable || s.localOnly || s.aiNoticeAck) return Promise.resolve(true);
  setOpen(true);
  return new Promise((resolve) => {
    pending = resolve;
  });
}

async function decide(patch: Partial<PublicSettings> | null) {
  if (patch) {
    try {
      await api.put('/settings', patch);
      await refresh();
    } catch {
      /* the action still continues; settings can be changed later */
    }
  }
  setOpen(false);
  pending?.(patch !== null);
  pending = null;
}

export function AiNoticeModal() {
  const isOpen = useSyncExternalStore(
    (cb) => {
      ls.add(cb);
      return () => ls.delete(cb);
    },
    () => open,
  );
  return (
    <Modal
      open={isOpen}
      onClose={() => void decide(null)}
      title="Before using AI"
      footer={
        <>
          <Button variant="ghost" onClick={() => void decide({ localOnly: true, aiNoticeAck: true })}>
            Keep everything local
          </Button>
          <Button variant="primary" onClick={() => void decide({ aiNoticeAck: true })}>
            Use AI
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-zinc-300">
        <p>Using AI sends your resume text and short summaries of your activity, tasks and deadlines to the Anthropic API to write plans and rankings.</p>
        <p>Your API key and GitHub token stay on this computer. You can switch to Local only at any time in Connections, and every feature keeps working with local rules instead.</p>
        <p className="text-zinc-400">This notice appears once.</p>
      </div>
    </Modal>
  );
}
