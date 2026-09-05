import DialogHost from "./DialogHost";
import styles from "./DialogHost.module.css";

export default function ConfirmCloseWorkspaceDialog({
  open,
  workspaceName,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  workspaceName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <DialogHost open={open} onClose={onCancel} ariaLabel="Close workspace confirmation">
      <h2 className={styles.title}>Close workspace?</h2>
      <p className={styles.body}>
        <strong style={{ color: "var(--color-text)", fontWeight: 600 }}>{workspaceName}</strong> will be closed.
        <br />
        Apps managed by this workspace may remain open in Windows unless the user chooses to close them.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.btn} onClick={onCancel} autoFocus>
          Cancel
        </button>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onConfirm}>
          Close Workspace
        </button>
      </div>
    </DialogHost>
  );
}
