// Inline warning strip for transient failures (plan read, OAuth callback).
// role="alert" so screen readers announce it — these appear after load, in
// response to something going wrong, and are easy to miss otherwise.
export default function NoticeBanner({ children, actionLabel, onAction }) {
  return (
    <div
      role="alert"
      style={{
        width: "100%", maxWidth: 900, marginBottom: 8, padding: "8px 14px",
        background: "var(--warning-bg)", border: "1px solid var(--warning-bd)",
        borderRadius: 8, fontSize: 12, color: "var(--warning)",
        textAlign: "center", display: "flex", alignItems: "center",
        justifyContent: "center", gap: 10, flexWrap: "wrap",
      }}
    >
      <span>{children}</span>
      {actionLabel && (
        <button
          onClick={onAction}
          style={{
            background: "transparent", border: "1px solid currentColor",
            borderRadius: 6, padding: "3px 10px", fontSize: 12,
            color: "inherit", cursor: "pointer",
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
