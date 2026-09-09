import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active shadow-sm',
        accent: 'bg-accent text-accent-foreground hover:bg-accent-hover active:bg-accent-active shadow-sm',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary-hover active:bg-secondary-active border border-border',
        outline: 'border border-border bg-transparent hover:bg-secondary',
        ghost: 'hover:bg-secondary',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive-hover active:bg-destructive-active',
        gold: 'bg-gold text-gold-foreground hover:bg-gold-hover active:bg-gold-active shadow-sm',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-8 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
));
Button.displayName = 'Button';

export { Button, buttonVariants };
