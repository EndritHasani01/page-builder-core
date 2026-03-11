import { ICON_DATA } from "./index";

type IconRendererProps = {
  icon: string;
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * Renders a bundled Lucide icon as an inline SVG.
 * All icon data is from the curated bundled set — not user input — so
 * dangerouslySetInnerHTML is safe here.
 */
export function IconRenderer({ icon, size = 24, color = "currentColor", className, style }: IconRendererProps) {
  const paths = ICON_DATA[icon];
  if (!paths) {
    // Render a placeholder square for unknown icon names
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      // Safe: content is from our bundled icon set, never user input
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  );
}
