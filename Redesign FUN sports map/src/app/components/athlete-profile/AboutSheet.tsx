import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "../ui/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "bottom" | "right";
  wide?: boolean;
  children: React.ReactNode;
  className?: string;
};

export function AboutSheet({ open, onOpenChange, side = "right", wide, children, className }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn(
          "border-white/10 bg-[#080c14] text-white p-0 flex flex-col",
          side === "right" && cn("w-full sm:max-w-md", wide && "md:max-w-lg lg:max-w-xl"),
          side === "bottom" && "h-[88vh] max-h-[720px] rounded-t-2xl",
          className,
        )}
      >
        <SheetHeader className="px-4 pt-4 pb-2 text-left border-b border-white/10 shrink-0">
          <SheetTitle className="text-lg">About</SheetTitle>
          <SheetDescription className="text-slate-500">
            Location, school, games you&apos;ve played, and your journey.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className={cn("flex-1 min-h-0", side === "bottom" ? "h-[calc(88vh-5rem)]" : "h-[calc(100vh-6rem)]")}>
          <div className="px-4 py-4 space-y-8 pb-10">{children}</div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
