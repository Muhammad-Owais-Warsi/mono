import * as React from "react";

type ButtonVariant = "default" | "outline" | "ghost" | "link" | "destructive";
type ButtonSize = "default" | "xs" | "sm" | "lg" | "icon" | "icon-tab";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const baseClasses =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:pointer-events-none disabled:opacity-50 dark:focus-visible:ring-zinc-300";

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900",
  outline: "border border-zinc-200 bg-transparent dark:border-zinc-800",
  ghost: "bg-transparent",
  link: "text-zinc-900 underline-offset-4 dark:text-zinc-50",
  destructive: "bg-red-500 text-zinc-50 dark:bg-red-900 dark:text-zinc-50",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-9 px-4 py-2",
  xs: "h-6 px-2 text-xs",
  sm: "h-8 px-3 text-xs",
  lg: "h-10 px-8",
  icon: "h-9 w-9",
  "icon-tab": "h-6 w-6 p-0",
};

function cx(...classes: Array<string | undefined | boolean>) {
  return classes.filter(Boolean).join(" ");
}

function buttonVariants({
  variant = "default",
  size = "default",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return cx(baseClasses, variantClasses[variant], sizeClasses[size], className);
}

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={buttonVariants({ variant, size, className })}
    />
  );
}

export { Button, buttonVariants };
