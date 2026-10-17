import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-mono font-medium tracking-wide uppercase transition-[opacity,transform,background-color,color] duration-150 ease-out active:not-disabled:scale-[0.96] disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
  {
    variants: {
      variant: {
        default: "bg-accent text-bg hover:opacity-90",
        ghost: "bg-transparent text-fg hover:bg-surface-2",
        outline: "bg-transparent text-fg shadow-[0_0_0_1px_var(--color-border-strong)] hover:bg-surface-2",
        danger: "bg-danger text-bg hover:opacity-90",
        dim: "bg-accent-dim text-accent hover:bg-surface-3",
      },
      size: {
        sm: "h-8 px-2.5 text-[10px] rounded-sm",
        md: "h-10 px-3 text-[11px] rounded-sm",
        lg: "h-11 px-4 text-xs rounded-md",
        icon: "size-10 rounded-sm",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
