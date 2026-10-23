import type { SVGProps } from "react";

/** Icônes du thème (traits, couleur du texte) : à la place des caractères de coche et de croix (règle typographique). */
type IconProps = SVGProps<SVGSVGElement> & { label?: string };
function Svg({
  label,
  children,
  strokeWidth = 2.4,
  ...rest
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": true })}
      {...rest}
    >
      {children}
    </svg>
  );
}
export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const CrossIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v9" />
    <path d="M12 19h.01" />
  </Svg>
);
