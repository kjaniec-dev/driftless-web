import { FormField, Input, Modal, ModalActions, ModalTitle } from "@kjaniec-dev/ui";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { FocusReturn } from "@/components/FocusReturn";
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
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial);
      setTouched(false);
    }
  }, [open, initial]);

  const empty = name.trim() === "";
  const submit = async () => {
    // A disabled submit button would also break the dialog's focus trap, so validate here.
    if (empty) {
      setTouched(true);
      return;
    }
    if (busy) return;
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
    <>
      <FocusReturn />
      <Modal open onClose={onClose} showClose={false}>
        <ModalTitle>{title}</ModalTitle>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <FormField
            label={t.start.nameLabel}
            {...(hint ? { hint } : {})}
            {...(touched && empty ? { error: t.issues.name_required } : {})}
          >
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
            <Button type="submit" loading={busy}>
              {confirmLabel}
            </Button>
          </ModalActions>
        </form>
      </Modal>
    </>
  );
}
