'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/api'
import { useLanguageStore } from '@/store/language'
import { cn } from '@/lib/utils'

const LESSON_TYPES = ['grammar', 'vocabulary', 'reading', 'writing', 'listening', 'speaking', 'review']
const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export default function OnDemandLessonPage() {
  const tPlan = useTranslations('plan')
  const router = useRouter()
  const activeLanguage = useLanguageStore((s) => s.activeLanguage)

  const [query, setQuery] = useState('')
  const [lessonType, setLessonType] = useState('grammar')
  const [cefrLevel, setCefrLevel] = useState('A2')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canGenerate = query.trim().length > 0 && !generating

  async function handleGenerate() {
    if (!canGenerate) return
    setGenerating(true)
    setError(null)
    try {
      const res = await apiFetch('/api/lessons/on-demand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          lesson_type: lessonType,
          cefr_level: cefrLevel,
          target_language: activeLanguage?.code ?? null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) )
        setError(data.detail ?? 'Failed to generate lesson')
        return
      }
      const data = await res.json()
      router.push('/lesson/' + data.lesson.id)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="border-fl-border bg-fl-surface border p-6">
        <p className="text-fl-fg font-mono text-lg font-bold tracking-wide">
          Create Your Own Lesson
        </p>
        <p className="text-fl-muted-1 mt-2 font-mono text-sm">
          Ask for exactly what you want to learn. Lingu will build a custom lesson
          with explanation, vocabulary, and exercises just for that topic.
        </p>
      </div>

      <div className="border-fl-border bg-fl-surface border p-6">
        <label className="text-fl-label text-fl-muted-2 block font-mono text-xs tracking-widest uppercase">
          What do you want to learn about?
        </label>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && canGenerate) {
              e.preventDefault()
              void handleGenerate()
            }
          }}
          placeholder='e.g. "How to use tal vez" or "Describe your morning routine"'
          rows={3}
          className="bg-fl-bg border-fl-border text-fl-fg focus:border-fl-border-2 mt-3 w-full border px-4 py-3 font-mono text-sm transition-colors focus:outline-none"
        />
      </div>

      <div className="border-fl-border bg-fl-surface border p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-40">
            <label className="text-fl-label text-fl-muted-2 block font-mono text-xs tracking-widest uppercase">
              Lesson Type
            </label>
            <select
              value={lessonType}
              onChange={(e) => setLessonType(e.target.value)}
              className="bg-fl-bg border-fl-border text-fl-fg focus:border-fl-border-2 mt-2 w-full appearance-none border px-4 py-3 font-mono text-sm tracking-widest uppercase transition-colors focus:outline-none"
            >
              {LESSON_TYPES.map((lt) => (
                <option key={lt} value={lt}>{lt}</option>
              ))}
            </select>
          </div>

          <div className="min-w-32">
            <label className="text-fl-label text-fl-muted-2 block font-mono text-xs tracking-widest uppercase">
              Level
            </label>
            <select
              value={cefrLevel}
              onChange={(e) => setCefrLevel(e.target.value)}
              className="bg-fl-bg border-fl-border text-fl-fg focus:border-fl-border-2 mt-2 w-full appearance-none border px-4 py-3 font-mono text-sm tracking-widest uppercase transition-colors focus:outline-none"
            >
              {CEFR_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>{lvl}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={cn(
              'px-8 py-3 font-mono text-sm font-bold tracking-widest uppercase transition-colors',
              canGenerate
                ? 'bg-fl-fg text-fl-bg hover:bg-fl-fg/90 focus-visible:outline-fl-fg focus-visible:outline-2 focus-visible:outline-offset-2'
                : 'bg-fl-muted-3/30 text-fl-muted-1 cursor-not-allowed',
            )}
          >
            {generating ? 'Generating...' : 'Generate Lesson'}
          </button>
        </div>
      </div>

      {error && (
        <div className="border-fl-border bg-fl-surface/80 border px-6 py-4">
          <p className="text-fl-muted-1 font-mono text-sm">{error}</p>
        </div>
      )}

      {generating && (
        <div className="border-fl-border bg-fl-surface/80 border px-6 py-4">
          <p className="text-fl-accent font-mono text-sm animate-pulse">
            Lingu is creating your lesson... This usually takes 10-20 seconds.
          </p>
        </div>
      )}
    </div>
  )
}
