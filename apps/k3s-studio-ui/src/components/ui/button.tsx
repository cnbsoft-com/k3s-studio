import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import * as React from "react";

const buttonVariants = cva(
  // Apple grammar (DESIGN.MD): signature pill, scale-95 active micro-interaction, focus-blue ring
  "inline-flex items-center justify-center gap-1.5 rounded-pill text-sm font-medium transition-[transform,background-color,color] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        // ghost pill — transparent with Action Blue ring, the second-CTA grammar
        outline: "border border-primary text-primary hover:bg-primary/5",
        destructive: "border border-destructive text-destructive hover:bg-destructive/10",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        // text link is not a pill — no scale, underline grammar
        link: "rounded-none text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        sm: "px-4 py-1.5",
        md: "px-5 py-2",
        lg: "px-7 py-2.5",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);
Button.displayName = "Button";

export { buttonVariants };
