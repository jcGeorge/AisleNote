import * as React from 'react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEventHandler,
  type ReactEventHandler,
} from 'react'
import { getMediaTransformMetadata } from './media-metadata'
import {
  DEFAULT_VIDEO_ASPECT_RATIO,
  getMediaFrameStyle,
  getMediaPlayerClassName,
  getMediaRootStyle,
  getMediaVideoStyle,
  getMediaViewportStyle,
  getVideoNaturalAspectRatio,
} from './media-rendering'
import {
  MEDIA_SEEK_STEP_SECONDS,
  MEDIA_LOAD_ERROR_TEXT,
  MEDIA_PLAYBACK_ERROR_TEXT,
  formatMediaTime,
  getMediaKeyboardAction,
  getMediaDisplayTitle,
  getMediaSeekTime,
  getMediaKindFromUrl,
  resolveMediaDisplayUrl,
  type MediaKind,
} from './media-utils'

import {
  MEDIA_DEFAULT_PLAYBACK_SPEED,
  MEDIA_DEFAULT_VOLUME_PERCENT,
  MEDIA_SPEED_PRESETS,
  formatMediaSpeedLabel,
  getSteppedMediaVolumePercent,
  normalizeMediaPlaybackSpeed,
  normalizeMediaVolumePercent,
} from './media-playback-settings'
import { applyMediaElementVolume, resumeMediaElementVolumeContext } from './media-volume'
import {
  MEDIA_CONTROL_ICON_SPECS,
  MEDIA_CONTROL_ICON_VIEW_BOX,
  getMediaVolumeIconName,
  type MediaControlIconName,
} from './media-control-icons'
import { isMediaPlaybackSettingsTargetForPlayer, syncMediaPlaybackPopupElement } from './media-playback-popups'
import {
  dispatchMediaRevealContextMenuEvent,
  getMediaRevealContextMenuDetailFromTarget,
} from './media-context-menu'
import { AppIcon } from '../components/icons/AppIcon'

void React

type MediaPlayerProps = {
  src: string
  kind?: MediaKind | null
  label?: string
}

function MediaControlIcon({ name }: { name: MediaControlIconName }) {
  const spec = MEDIA_CONTROL_ICON_SPECS[name]
  if (spec.appIconId) return <AppIcon iconId={spec.appIconId} className={`tabs-media-icon ${spec.className}`} />

  return (
    <svg
      className={spec.svgClassName ?? `tabs-media-icon ${spec.className}`}
      viewBox={spec.viewBox ?? MEDIA_CONTROL_ICON_VIEW_BOX}
      aria-hidden="true"
      focusable="false"
    >
      {spec.paths.map((path, index) => (
        <path
          key={`${name}-${index}`}
          className={path.className ?? (path.fill ? 'tabs-media-icon-fill' : undefined)}
          d={path.d}
        />
      ))}
    </svg>
  )
}

export function MediaPlayer({ src, kind: providedKind, label = '' }: MediaPlayerProps) {
  const playerRef = useRef<HTMLSpanElement | null>(null)
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const speedButtonRef = useRef<HTMLButtonElement | null>(null)
  const speedMenuRef = useRef<HTMLSpanElement | null>(null)
  const volumeButtonRef = useRef<HTMLButtonElement | null>(null)
  const volumePopupRef = useRef<HTMLSpanElement | null>(null)
  const kind = providedKind ?? getMediaKindFromUrl(src) ?? 'audio'
  const displaySrc = useMemo(() => resolveMediaDisplayUrl(src), [src])
  const mediaMetadata = useMemo(() => getMediaTransformMetadata(src), [src])
  const transformMetadata = kind === 'video' ? mediaMetadata : null
  const metadataSpeed = mediaMetadata?.speed ?? MEDIA_DEFAULT_PLAYBACK_SPEED
  const metadataVolume = mediaMetadata?.volume ?? MEDIA_DEFAULT_VOLUME_PERCENT
  const [naturalAspectRatio, setNaturalAspectRatio] = useState(DEFAULT_VIDEO_ASPECT_RATIO)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(metadataSpeed)
  const [volumePercent, setVolumePercent] = useState(metadataVolume)
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false)
  const [volumePopupOpen, setVolumePopupOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackError, setPlaybackError] = useState('')
  const title = getMediaDisplayTitle(label, kind)

  useEffect(() => {
    setPlaybackSpeed(metadataSpeed)
  }, [metadataSpeed])

  useEffect(() => {
    setVolumePercent(metadataVolume)
  }, [metadataVolume])

  useEffect(() => {
    if (!mediaRef.current) return
    mediaRef.current.playbackRate = playbackSpeed
  }, [playbackSpeed])

  useEffect(() => {
    applyMediaElementVolume(mediaRef.current, volumePercent)
  }, [volumePercent])

  useEffect(() => {
    syncMediaPlaybackPopupElement(
      speedMenuRef.current,
      speedButtonRef.current,
      speedMenuOpen,
      kind === 'audio' ? 'left' : 'center',
    )
  }, [kind, speedMenuOpen])

  useEffect(() => {
    syncMediaPlaybackPopupElement(
      volumePopupRef.current,
      volumeButtonRef.current,
      volumePopupOpen,
      kind === 'audio' ? 'left' : 'center',
    )
  }, [kind, volumePopupOpen])

  const closePlaybackPopups = useCallback(() => {
    setSpeedMenuOpen(false)
    setVolumePopupOpen(false)
  }, [])

  useEffect(() => {
    if (!speedMenuOpen && !volumePopupOpen) return
    const player = playerRef.current
    const ownerDocument = player?.ownerDocument
    if (!player || !ownerDocument) return
    const handleDocumentPointerDown = (event: PointerEvent) => {
      if (isMediaPlaybackSettingsTargetForPlayer(player, event.target)) return
      closePlaybackPopups()
    }
    ownerDocument.addEventListener('pointerdown', handleDocumentPointerDown, true)
    return () => {
      ownerDocument.removeEventListener('pointerdown', handleDocumentPointerDown, true)
    }
  }, [closePlaybackPopups, speedMenuOpen, volumePopupOpen])

  const syncMediaState: ReactEventHandler<HTMLMediaElement> = (event) => {
    const media = event.currentTarget
    setCurrentTime(Number.isFinite(media.currentTime) ? media.currentTime : 0)
    setDuration(Number.isFinite(media.duration) && media.duration > 0 ? media.duration : 0)
    setPlaying(!media.paused && !media.ended)
  }

  const syncLoadedMetadata: ReactEventHandler<HTMLMediaElement> = (event) => {
    setPlaybackError('')
    event.currentTarget.playbackRate = playbackSpeed
    applyMediaElementVolume(event.currentTarget, volumePercent)
    syncMediaState(event)
    if (event.currentTarget instanceof HTMLVideoElement) {
      setNaturalAspectRatio(getVideoNaturalAspectRatio(event.currentTarget))
    }
  }

  const syncPlaying: ReactEventHandler<HTMLMediaElement> = (event) => {
    setPlaybackError('')
    syncMediaState(event)
  }

  const seekBy = (deltaSeconds: number) => {
    const media = mediaRef.current
    if (!media) return
    media.currentTime = getMediaSeekTime(media.currentTime, deltaSeconds, media.duration)
    setCurrentTime(media.currentTime)
  }

  const togglePlayback = () => {
    const media = mediaRef.current
    if (!media) return
    resumeMediaElementVolumeContext(media)
    if (media.paused || media.ended) {
      setPlaybackError('')
      void media.play().catch(() => {
        setPlaybackError(MEDIA_PLAYBACK_ERROR_TEXT)
      })
      return
    }
    media.pause()
  }

  const toggleLoop = () => {
    const media = mediaRef.current
    const nextLoop = !loop
    if (media) media.loop = nextLoop
    setLoop(nextLoop)
  }

  const selectPlaybackSpeed = (value: number) => {
    setPlaybackSpeed(normalizeMediaPlaybackSpeed(value) ?? MEDIA_DEFAULT_PLAYBACK_SPEED)
    setSpeedMenuOpen(false)
  }

  const selectVolumePercent = (value: unknown) => {
    setVolumePercent(normalizeMediaVolumePercent(value) ?? MEDIA_DEFAULT_VOLUME_PERCENT)
  }

  const handlePlayerKeyDown: KeyboardEventHandler<HTMLElement> = (event) => {
    const action = getMediaKeyboardAction(event)
    if (!action) {
      event.stopPropagation()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (action === 'toggle-playback') {
      if (!event.repeat) togglePlayback()
      return
    }
    if (action === 'volume-down' || action === 'volume-up') {
      setVolumePercent((current) => getSteppedMediaVolumePercent(current, action === 'volume-up' ? 'up' : 'down'))
      return
    }
    seekBy(action === 'seek-backward' ? -MEDIA_SEEK_STEP_SECONDS : MEDIA_SEEK_STEP_SECONDS)
  }

  const handlePlayerKeyUp: KeyboardEventHandler<HTMLElement> = (event) => {
    if (!getMediaKeyboardAction(event)) {
      event.stopPropagation()
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  const closePlaybackPopupsFromPlayerClick = (target: EventTarget | null) => {
    if (isMediaPlaybackSettingsTargetForPlayer(playerRef.current, target)) return
    closePlaybackPopups()
  }

  const mediaProps = {
    src: displaySrc,
    preload: 'metadata',
    loop,
    onLoadedMetadata: syncLoadedMetadata,
    onDurationChange: syncMediaState,
    onTimeUpdate: syncMediaState,
    onPlay: syncPlaying,
    onPause: syncMediaState,
    onEnded: syncMediaState,
    onError: () => setPlaybackError(MEDIA_LOAD_ERROR_TEXT),
  }

  return (
    <span
      ref={playerRef}
      className={getMediaPlayerClassName(kind, transformMetadata)}
      data-media-kind={kind}
      data-media-source={src}
      contentEditable={false}
      role="group"
      aria-label={`${title} player`}
      style={getMediaRootStyle(transformMetadata) as CSSProperties}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        closePlaybackPopupsFromPlayerClick(event.target)
        event.stopPropagation()
      }}
      onContextMenu={(event) => {
        const detail = getMediaRevealContextMenuDetailFromTarget(event.target as Element | null, event.clientX, event.clientY)
        if (!detail) return
        event.preventDefault()
        event.stopPropagation()
        dispatchMediaRevealContextMenuEvent(event.currentTarget, detail)
      }}
      onKeyDown={handlePlayerKeyDown}
      onKeyUp={handlePlayerKeyUp}
    >
      {kind === 'video' ? (
        <span
          className="tabs-media-viewport"
          style={getMediaViewportStyle(transformMetadata, naturalAspectRatio) as CSSProperties}
        >
          <span
            className="tabs-media-frame"
            style={getMediaFrameStyle(transformMetadata, naturalAspectRatio) as CSSProperties}
          >
            <video
              {...mediaProps}
              ref={(node) => {
                mediaRef.current = node
              }}
              className="tabs-media-video"
              style={getMediaVideoStyle(transformMetadata) as CSSProperties}
              playsInline
              draggable={false}
            />
          </span>
        </span>
      ) : (
        <audio
          {...mediaProps}
          ref={(node) => {
            mediaRef.current = node
          }}
          className="tabs-media-native"
        />
      )}
      <span className="tabs-media-controls">
        <span className="tabs-media-title">{title}</span>
        <button
          type="button"
          className="tabs-media-btn tabs-media-play-btn"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={togglePlayback}
        >
          <MediaControlIcon name={playing ? 'pause' : 'play'} />
        </button>
        <button
          type="button"
          className="tabs-media-btn tabs-media-loop-btn"
          aria-label={loop ? 'Loop on' : 'Loop off'}
          aria-pressed={loop}
          onClick={toggleLoop}
        >
          <MediaControlIcon name="loop" />
        </button>
        <span className="tabs-media-speed-wrap">
          <button
            ref={speedButtonRef}
            type="button"
            className="tabs-media-btn tabs-media-speed-btn"
            aria-label={`Playback speed ${formatMediaSpeedLabel(playbackSpeed)}`}
            aria-haspopup="listbox"
            onClick={() => {
              setSpeedMenuOpen((current) => !current)
              setVolumePopupOpen(false)
            }}
          >
            {formatMediaSpeedLabel(playbackSpeed)}
          </button>
          <span
            ref={speedMenuRef}
            className="tabs-media-speed-menu"
            role="listbox"
            popover="manual"
            hidden={!speedMenuOpen}
          >
            {MEDIA_SPEED_PRESETS.map((speed) => (
              <button
                key={speed}
                type="button"
                className="tabs-media-speed-option"
                role="option"
                aria-selected={speed === playbackSpeed}
                onClick={() => selectPlaybackSpeed(speed)}
              >
                {formatMediaSpeedLabel(speed)}
              </button>
            ))}
          </span>
        </span>
        <span className="tabs-media-volume-wrap">
          <button
            ref={volumeButtonRef}
            type="button"
            className="tabs-media-btn tabs-media-volume-btn"
            aria-label={`Volume ${volumePercent}%`}
            aria-haspopup="true"
            onClick={() => {
              setVolumePopupOpen((current) => !current)
              setSpeedMenuOpen(false)
            }}
          >
            <MediaControlIcon name={getMediaVolumeIconName(volumePercent)} />
          </button>
          <span
            ref={volumePopupRef}
            className="tabs-media-volume-popup"
            popover="manual"
            hidden={!volumePopupOpen}
          >
            <input
              type="range"
              className="tabs-media-volume-slider"
              min={0}
              max={150}
              step={1}
              value={volumePercent}
              aria-label="Media volume"
              onChange={(event) => selectVolumePercent(event.currentTarget.value)}
            />
          </span>
        </span>
        <span className="tabs-media-time tabs-media-time-current">{formatMediaTime(currentTime)}</span>
        <input
          type="range"
          className="tabs-media-slider"
          min={0}
          max={duration || 0}
          step={0.01}
          value={duration ? Math.min(currentTime, duration) : 0}
          disabled={!duration}
          aria-label="Media position"
          onChange={(event) => {
            const media = mediaRef.current
            if (!media) return
            media.currentTime = getMediaSeekTime(0, Number(event.currentTarget.value), media.duration)
            setCurrentTime(media.currentTime)
          }}
        />
        <span className="tabs-media-time tabs-media-time-duration">{formatMediaTime(duration)}</span>
        <button
          type="button"
          className="tabs-media-btn tabs-media-back-btn editor-history-toolbar-btn editor-history-toolbar-btn-undo"
          aria-label={`Back ${MEDIA_SEEK_STEP_SECONDS} seconds`}
          onClick={() => seekBy(-MEDIA_SEEK_STEP_SECONDS)}
        >
          <MediaControlIcon name="undo" />
        </button>
        <button
          type="button"
          className="tabs-media-btn tabs-media-forward-btn editor-history-toolbar-btn editor-history-toolbar-btn-redo"
          aria-label={`Forward ${MEDIA_SEEK_STEP_SECONDS} seconds`}
          onClick={() => seekBy(MEDIA_SEEK_STEP_SECONDS)}
        >
          <MediaControlIcon name="redo" />
        </button>
        {playbackError ? (
          <span className="tabs-media-error" role="status">
            {playbackError}
          </span>
        ) : null}
      </span>
    </span>
  )
}
