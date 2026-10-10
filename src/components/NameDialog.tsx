import { FormField, Input, Modal, ModalActions, ModalTitle } from "@kjaniec-dev/ui";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { useI18n } from "@/i18n";
import { LIMITS } from "@/storage/model";

/** Ask for a portfolio name (create / rename). Enter submits, Escape closes. */
export function NameDialog({
  open,
  title,
  confirmLabel,
  initial = "",
  hint,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  initial?: string;
  hint?: string;
  onClose: () => void;
  onSubmit: (name: string) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);

  const empty = name.trim() === "";
  const submit = async () => {
    if (empty || busy) return;
    setBusy(true);
    try {
      await onSubmit(name.trim());
    } finally {
      setBusy(false);
    }
  };

  // The kit's Modal stays mounted when closed (only hidden with CSS), which would leave its
  // controls focusable and exposed to screen readers. Mount it only while it is open.
  if (!open) return null;

  return (
    <Modal open onClose={onClose}>
      <ModalTitle>{title}</ModalTitle>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <FormField label={t.start.nameLabel} {...(hint ? { hint } : {})}>
          <Input
            autoFocus
            maxLength={LIMITS.text}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <ModalActions>
          <Button type="button" variant="quiet" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button type="submit" disabled={empty} loading={busy}>
            {confirmLabel}
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}
