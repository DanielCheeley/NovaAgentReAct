import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="badge"
      className={cn("inline-flex shrink-0 items-center gap-2 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}
