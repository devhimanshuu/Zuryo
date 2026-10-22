import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils/cn";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent font-semibold whitespace-nowrap transition-[background-color,border-color,transform] duration-150 ease-(--ease-standard) active:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand text-on-brand hover:bg-brand-strong",
        instant: "bg-accent text-on-accent hover:brightness-95",
        secondary: "border-control bg-raised text-ink hover:bg-sunken",
        ghost: "text-ink hover:bg-sunken",
        inverse: "bg-ink-inverse text-ink hover:bg-ink-inverse/90",
        danger: "bg-danger text-on-danger hover:brightness-95",
        link: "h-auto px-0 text-brand underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-body-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-5 text-base",
        icon: "size-10",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild,
  loading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
}
