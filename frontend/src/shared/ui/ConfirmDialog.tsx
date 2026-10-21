import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { Button } from "./Button";

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  trigger,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  trigger: ReactNode;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-5 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-slate-900">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-slate-600">{body}</Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary" type="button">
                Cancel
              </Button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <Button type="button" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
