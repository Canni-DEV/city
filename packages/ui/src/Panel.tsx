import type { HTMLAttributes, PropsWithChildren } from "react";

export function Panel({
  children,
  className = "",
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLElement>>) {
  return (
    <section className={`city-panel ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}
