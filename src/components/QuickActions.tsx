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
          className="h-8 border-line bg-sand/70 text-[11px] text-ink/80 hover:border-coral/50 hover:text-sea"
          onClick={() => onSelect(action.prompt)}
        >
          {action.labelRu}
        </Button>
      ))}
    </div>
  )
}
