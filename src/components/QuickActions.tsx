import { QUICK_ACTIONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'

export function QuickActions({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {QUICK_ACTIONS.map((action) => (
        <Button
          key={action.id}
          type="button"
          variant="outline"
          size="sm"
          className="h-8 border-slate-700/80 bg-slate-900/40 text-[11px] text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200"
          onClick={() => onSelect(action.prompt)}
        >
          {action.labelRu}
        </Button>
      ))}
    </div>
  )
}
