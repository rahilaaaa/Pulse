
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="confirm-dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) {
          onCancel();
        }
      }}
    >
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <div className="confirm-dialog-icon">
          !
        </div>

        <div className="confirm-dialog-content">
          <h2 id="confirm-dialog-title">{title}</h2>

          <p id="confirm-dialog-message">{message}</p>
        </div>

        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="confirm-dialog-cancel"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelText}
          </button>

          <button
            type="button"
            className="confirm-dialog-confirm"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Please wait..." : confirmText}
          </button>
        </div>
      </section>
    </div>
  );
}
