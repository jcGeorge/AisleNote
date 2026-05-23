import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  getSaturationDarknessFromPoint,
  getPickerPanelPlacement,
  hexToHsv,
  hsvToHex,
  nudgeSaturationDarkness,
  type PickerPanelPlacement,
  type HsvColor,
} from '../../settings/color-utils'
import { normalizeHexColor } from '../../settings/defaults'

type CustomThemeColorPickerProps = {
  slotId: string
  label: string
  value: string
  fallbackValue: string
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
  onChange: (value: string) => void
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

function getHueColor(hue: number): string {
  return `hsl(${Math.round(hue)} 100% 50%)`
}

function isSixDigitHexDraft(value: string): boolean {
  return /^#?[0-9a-f]{6}$/i.test(value.trim())
}

export function CustomThemeColorPicker({
  slotId,
  label,
  value,
  fallbackValue,
  isOpen,
  onToggle,
  onClose,
  onChange,
}: CustomThemeColorPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const copyStatusResetRef = useRef<number | null>(null)
  const panelAnchorRef = useRef<{ x: number; y: number } | null>(null)
  const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv(value, fallbackValue))
  const [hexDraft, setHexDraft] = useState(value)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [panelPlacement, setPanelPlacement] = useState<PickerPanelPlacement | null>(null)
  const panelId = `custom-theme-picker-${slotId}`
  const normalizedHexFromHsv = hsvToHex(hsv)

  useEffect(() => {
    setHsv((current) => {
      if (hsvToHex(current) === value) return current
      return hexToHsv(value, fallbackValue)
    })
    setHexDraft(value)
  }, [fallbackValue, value])

  useEffect(() => () => {
    if (copyStatusResetRef.current !== null) window.clearTimeout(copyStatusResetRef.current)
  }, [])

  useEffect(() => {
    if (isOpen) return
    setHexDraft((current) => normalizeHexColor(current) ?? value)
    setPanelPlacement(null)
  }, [isOpen, value])

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current || !panelRef.current) return undefined

    const updatePanelPlacement = () => {
      const buttonRect = buttonRef.current?.getBoundingClientRect()
      const panelRect = panelRef.current?.getBoundingClientRect()
      if (!buttonRect || !panelRect) return
      const anchor = panelAnchorRef.current ?? {
        x: buttonRect.left + buttonRect.width / 2,
        y: buttonRect.top + buttonRect.height / 2,
      }
      setPanelPlacement(getPickerPanelPlacement({
        anchorX: anchor.x,
        anchorY: anchor.y,
        panelWidth: panelRect.width,
        panelHeight: panelRect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }))
    }

    updatePanelPlacement()
    window.addEventListener('resize', updatePanelPlacement)
    window.addEventListener('scroll', updatePanelPlacement, true)
    return () => {
      window.removeEventListener('resize', updatePanelPlacement)
      window.removeEventListener('scroll', updatePanelPlacement, true)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return undefined

    const handleDocumentPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose()
    }
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
      buttonRef.current?.focus()
    }

    document.addEventListener('pointerdown', handleDocumentPointerDown)
    document.addEventListener('keydown', handleDocumentKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown)
      document.removeEventListener('keydown', handleDocumentKeyDown)
    }
  }, [isOpen, onClose])

  const setTimedCopyStatus = (status: 'copied' | 'failed') => {
    if (copyStatusResetRef.current !== null) window.clearTimeout(copyStatusResetRef.current)
    setCopyStatus(status)
    copyStatusResetRef.current = window.setTimeout(() => {
      setCopyStatus('idle')
      copyStatusResetRef.current = null
    }, 1200)
  }

  const commitHsv = (nextHsv: HsvColor) => {
    const nextHex = hsvToHex(nextHsv)
    setHsv(nextHsv)
    setHexDraft(nextHex)
    onChange(nextHex)
  }

  const commitHex = (rawValue: string): boolean => {
    const normalized = normalizeHexColor(rawValue)
    if (!normalized) return false
    setHexDraft(normalized)
    setHsv(hexToHsv(normalized, fallbackValue))
    onChange(normalized)
    return true
  }

  const handleHexDraftChange = (rawValue: string) => {
    setHexDraft(rawValue)
    if (isSixDigitHexDraft(rawValue)) commitHex(rawValue)
  }

  const handleHexDraftBlur = () => {
    if (commitHex(hexDraft)) return
    setHexDraft(value)
  }

  const handleHexDraftKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (commitHex(hexDraft)) return
    setHexDraft(value)
  }

  const updateSaturationDarkness = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const next = getSaturationDarknessFromPoint(event.clientX, event.clientY, rect)
    commitHsv({ ...hsv, ...next })
  }

  const handleSaturationDarknessPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    updateSaturationDarkness(event)
  }

  const handleSaturationDarknessPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return
    updateSaturationDarkness(event)
  }

  const handleSaturationDarknessKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const nextHsv = nudgeSaturationDarkness(hsv, event.key, { largeStep: event.shiftKey })
    if (!nextHsv) return
    event.preventDefault()
    commitHsv(nextHsv)
  }

  const handleHueChange = (rawValue: string) => {
    commitHsv({ ...hsv, h: Number(rawValue) })
  }

  const handleCopyHex = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard text writes are unavailable.')
      await navigator.clipboard.writeText(normalizedHexFromHsv)
      setTimedCopyStatus('copied')
    } catch {
      setTimedCopyStatus('failed')
    }
  }

  const handleSwatchClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.clientX !== 0 || event.clientY !== 0) {
      panelAnchorRef.current = { x: event.clientX, y: event.clientY }
    } else {
      const rect = event.currentTarget.getBoundingClientRect()
      panelAnchorRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }
    onToggle()
  }

  const pickerStyle = {
    '--custom-color-picker-hue': getHueColor(hsv.h),
    '--custom-color-picker-selected': normalizedHexFromHsv,
  } as CSSProperties

  return (
    <div className="custom-theme-color-picker" ref={rootRef} style={pickerStyle}>
      <button
        ref={buttonRef}
        type="button"
        className="custom-theme-swatch-button"
        aria-label={`${label} color swatch`}
        aria-controls={panelId}
        aria-expanded={isOpen}
        onClick={handleSwatchClick}
      >
        <span className="custom-theme-swatch-preview" aria-hidden="true" />
      </button>
      {isOpen && (
        <div
          ref={panelRef}
          className={`custom-color-picker-panel ${panelPlacement ? `is-${panelPlacement.placement}` : 'is-measuring'}`}
          id={panelId}
          aria-label={`${label} color picker`}
          style={
            panelPlacement
              ? {
                  left: `${panelPlacement.left}px`,
                  top: `${panelPlacement.top}px`,
                  width: `${panelPlacement.width}px`,
                }
              : undefined
          }
        >
          <div
            className="custom-color-picker-square"
            role="slider"
            tabIndex={0}
            aria-label={`${label} saturation and darkness`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(hsv.v)}
            aria-valuetext={`saturation ${formatPercent(hsv.s)}, brightness ${formatPercent(hsv.v)}`}
            onPointerDown={handleSaturationDarknessPointerDown}
            onPointerMove={handleSaturationDarknessPointerMove}
            onKeyDown={handleSaturationDarknessKeyDown}
          >
            <span
              className="custom-color-picker-square-thumb"
              style={{
                left: `${hsv.s}%`,
                top: `${100 - hsv.v}%`,
              }}
              aria-hidden="true"
            />
          </div>
          <label className="custom-color-picker-hue-row">
            <input
              className="custom-color-picker-hue-input"
              type="range"
              min="0"
              max="359"
              step="1"
              value={Math.round(hsv.h)}
              aria-label={`${label} hue`}
              onChange={(event) => handleHueChange(event.target.value)}
            />
          </label>
          <div className="custom-color-picker-hex-row">
            <span className="custom-color-picker-preview-swatch" aria-hidden="true" />
            <input
              className="settings-text-input custom-color-picker-hex-input"
              type="text"
              value={hexDraft}
              spellCheck={false}
              inputMode="text"
              aria-label={`${label} picker hex value`}
              onChange={(event) => handleHexDraftChange(event.target.value)}
              onBlur={handleHexDraftBlur}
              onKeyDown={handleHexDraftKeyDown}
            />
            <button
              type="button"
              className="btn btn-sm settings-action-btn custom-color-picker-copy-btn"
              aria-label={`copy ${label} hex`}
              onClick={handleCopyHex}
            >
              {copyStatus === 'copied' ? 'copied' : copyStatus === 'failed' ? 'failed' : 'copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
