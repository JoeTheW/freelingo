'use client'

import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/api'
import { useConfigStore } from '@/store/config'

const OPENAI_VOICES = [
  'alloy',
  'ash',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
] as const
const TTS_VOICE_STORAGE_KEY = 'tts_voice'

interface PiperVoice {
  id: string
  name: string
  file: string
  language: string
  language_code: string
  quality: string
}

export function VoiceSection({ title }: { title?: string } = {}) {
  const t = useTranslations('settings')
  const ttsProvider = useConfigStore((s) => s.ttsProvider)
  const openaiTtsVoice = useConfigStore((s) => s.openaiTtsVoice)
  const ttsVoiceSelectable = useConfigStore((s) => s.ttsVoiceSelectable)

  const [selectedVoice, setSelectedVoice] = useState<string>('')
  const [playingVoice, setPlayingVoice] = useState<string | null>(null)
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null)
  const [piperVoices, setPiperVoices] = useState<PiperVoice[]>([])
  const [voicesLoaded, setVoicesLoaded] = useState(false)
  const [voicesError, setVoicesError] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!ttsVoiceSelectable) return
    const stored =
      typeof window !== 'undefined'
        ? localStorage.getItem(TTS_VOICE_STORAGE_KEY)
        : null

    if (ttsProvider === 'openai') {
      const voices: readonly string[] = OPENAI_VOICES
      setSelectedVoice(
        stored && voices.includes(stored) ? stored : openaiTtsVoice || 'nova'
      )
    } else if (ttsProvider === 'piper') {
      void loadPiperVoices(stored)
    }
  }, [ttsProvider, openaiTtsVoice, ttsVoiceSelectable])

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  async function loadPiperVoices(storedVoice: string | null) {
    if (voicesLoaded) return
    try {
      const res = await apiFetch('/api/tts/voices')
      if (!res.ok) {
        setVoicesError(true)
        return
      }
      const data: PiperVoice[] = await res.json()
      setPiperVoices(data)
      setVoicesLoaded(true)
      setVoicesError(false)

      // Restore stored voice if valid
      if (storedVoice && data.some((v) => v.id === storedVoice || v.file === storedVoice)) {
        setSelectedVoice(storedVoice)
      } else if (data.length > 0) {
        setSelectedVoice(data[0].id)
      }
    } catch {
      setVoicesError(true)
    }
  }

  function selectVoice(voice: string) {
    setSelectedVoice(voice)
    localStorage.setItem(TTS_VOICE_STORAGE_KEY, voice)
  }

  async function togglePreview(voice: string) {
    if (playingVoice === voice) {
      audioRef.current?.pause()
      audioRef.current = null
      setPlayingVoice(null)
      return
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
      setPlayingVoice(null)
    }
    setLoadingVoice(voice)
    try {
      const res = await apiFetch(`/api/tts/preview/${voice}`)
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      setPlayingVoice(voice)
      audio.onended = () => {
        URL.revokeObjectURL(url)
        setPlayingVoice(null)
        audioRef.current = null
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        setPlayingVoice(null)
        audioRef.current = null
      }
      await audio.play()
    } finally {
      setLoadingVoice(null)
    }
  }

  if (!ttsVoiceSelectable) return null

  return (
    <div className="border-fl-border bg-fl-surface border p-6">
      <div className="border-fl-border mb-5 flex items-center gap-2 border-b pb-4">
        <span className="text-fl-label text-fl-muted-2">●</span>
        <span className="text-fl-label text-fl-muted-2 font-mono tracking-widest uppercase">
          {title ?? t('sectionVoice')}
        </span>
      </div>
      <p className="text-fl-hint text-fl-muted-3 mb-4 font-mono">
        {t('voiceHint')}
      </p>
      <div className="flex items-center gap-3">
        <select
          value={selectedVoice}
          onChange={(e) => selectVoice(e.target.value)}
          className="bg-fl-bg border-fl-border text-fl-fg focus:border-fl-border-2 flex-1 appearance-none border px-4 py-3 font-mono text-sm tracking-widest uppercase transition-colors focus:outline-none"
        >
          {ttsProvider === 'openai' && OPENAI_VOICES.map((voice) => (
            <option key={voice} value={voice}>
              {voice}
            </option>
          ))}
          {ttsProvider === 'piper' && !voicesError && piperVoices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}{v.language ? ` (${v.language})` : ''}
              {v.quality ? ` [${v.quality}]` : ''}
            </option>
          ))}
          {ttsProvider === 'piper' && voicesError && (
            <option value="" disabled>Failed to load voices</option>
          )}
        </select>
        <button
          type="button"
          onClick={() => void togglePreview(selectedVoice)}
          disabled={loadingVoice === selectedVoice || !selectedVoice}
          className="text-fl-muted-3 hover:text-fl-fg border-fl-border hover:border-fl-border-2 border px-4 py-3 font-mono text-xs tracking-widest whitespace-nowrap uppercase transition-colors disabled:opacity-40"
        >
          {loadingVoice === selectedVoice
            ? '...'
            : playingVoice === selectedVoice
              ? t('voiceStop')
              : t('voicePlay')}
        </button>
      </div>
    </div>
  )
}
