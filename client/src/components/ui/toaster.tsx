import { useEffect } from "react";
import { useToastState, type Toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

function ToastItem({ toast }: { toast: Toast }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 w-80 p-4 rounded-lg border shadow-lg bg-white",
        toast.variant === "destructive"
          ? "border-red-200 bg-red-50"
          : "border-gray-200",
      )}
    >
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm font-medium",
          toast.variant === "destructive" ? "text-red-800" : "text-gray-900",
        )}>
          {toast.title}
        </p>
        {toast.description && (
          <p className="text-xs text-gray-500 mt-0.5">{toast.description}</p>
        )}
      </div>
    </div>
  );
}

export function Toaster() {
  const { list, register, setList } = useToastState();

  useEffect(() => {
    const unsub = register(setList);
    return unsub;
  }, [register, setList]);

  if (list.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {list.map(t => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
}
