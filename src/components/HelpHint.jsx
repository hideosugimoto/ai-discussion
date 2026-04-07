import { useHelp } from "../hooks/useHelp.jsx";

// Small inline help text, rendered only when helpMode is ON.
// Use for explaining buttons / controls that might not be self-explanatory.
//
// Example:
//   <button title="..." onClick={...}>共有</button>
//   <HelpHint>この議論を共有可能なリンクとして公開します</HelpHint>
//
// The `title` attribute handles PC hover, HelpHint handles mobile.
export default function HelpHint({ children, inline = false, style = {} }) {
  const { helpMode } = useHelp();
  if (!helpMode) return null;
  return (
    <div
      style={{
        fontSize: 10,
        color: "var(--text3)",
        lineHeight: 1.5,
        marginTop: inline ? 0 : 4,
        marginLeft: inline ? 6 : 0,
        display: inline ? "inline" : "block",
        ...style,
      }}
    >
      💡 {children}
    </div>
  );
}
