import {
  MEDIA_SEEK_STEP_SECONDS,
  MEDIA_LOAD_ERROR_TEXT,
  MEDIA_PLAYBACK_ERROR_TEXT,
  formatMediaTime,
  getMediaKeyboardAction,
  getMediaDisplayTitle,
  getMediaSeekTime,
  getMediaSliderDisplayValue,
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
  DEFAULT_VIDEO_ASPECT_RATIO,
  applyMediaMetadataToPlayer,
  getMediaFrameStyle,
  getMediaPlayerClassName,
  getMediaRootStyle,
  getMediaVideoStyle,
  getMediaViewportStyle,
  getVideoNaturalAspectRatio,
} from './media-rendering'
import { getMediaTransformMetadata, withMediaTransformMetadata } from './media-metadata'
import { createMediaControlIconElement, getMediaVolumeIconName, type MediaControlIconName } from './media-control-icons'
import { isMediaPlaybackSettingsTargetForPlayer, syncMediaPlaybackPopupElement } from './media-playback-popups'

type MediaPlayerElementOptions = {
  kind: MediaKind
  src: string
  label?: string
  sourceFrom?: number
  sourceTo?: number
  onSourceChange?: (nextSrc: string) => void
}

function stopMediaEvent(event: Event) {
  event.stopPropagation()
}

function setButtonIcon(button: HTMLButtonElement, iconName: MediaControlIconName) {
  button.textContent = ''
  button.append(createMediaControlIconElement(iconName))
}

function assignStyles(element: HTMLElement, styles: Record<string, string>) {
  Object.assign(element.style, styles)
}

export function createMediaPlayerElement({
  kind,
  src,
  label = '',
  sourceFrom,
  sourceTo,
  onSourceChange,
}: MediaPlayerElementOptions): HTMLElement {
  const mediaMetadata = getMediaTransformMetadata(src)
  const transformMetadata = kind === 'video' ? mediaMetadata : null
  let mediaSource = src
  let playbackSpeed = mediaMetadata?.speed ?? MEDIA_DEFAULT_PLAYBACK_SPEED
  let volumePercent = mediaMetadata?.volume ?? MEDIA_DEFAULT_VOLUME_PERCENT
  const wrapper = document.createElement('span')
  wrapper.className = getMediaPlayerClassName(kind, transformMetadata)
  wrapper.setAttribute('contenteditable', 'false')
  wrapper.setAttribute('data-media-kind', kind)
  wrapper.setAttribute('data-media-source', src)
  wrapper.setAttribute('data-media-label', label)
  if (typeof sourceFrom === 'number') wrapper.setAttribute('data-media-source-from', String(sourceFrom))
  if (typeof sourceTo === 'number') wrapper.setAttribute('data-media-source-to', String(sourceTo))
  wrapper.setAttribute('role', 'group')
  const displayTitle = getMediaDisplayTitle(label, kind)
  wrapper.setAttribute('aria-label', `${displayTitle} player`)
  assignStyles(wrapper, getMediaRootStyle(transformMetadata))

  const media = document.createElement(kind)
  media.className = kind === 'video' ? 'aislenote-media-video' : 'aislenote-media-native'
  media.preload = 'metadata'
  media.src = resolveMediaDisplayUrl(src)
  media.playbackRate = playbackSpeed
  applyMediaElementVolume(media, volumePercent)
  if (kind === 'video') {
    ;(media as HTMLVideoElement).playsInline = true
    media.setAttribute('draggable', 'false')
  }

  const controls = document.createElement('span')
  controls.className = 'aislenote-media-controls'

  const title = document.createElement('span')
  title.className = 'aislenote-media-title'
  title.textContent = displayTitle

  const playButton = document.createElement('button')
  playButton.type = 'button'
  playButton.className = 'aislenote-media-btn aislenote-media-play-btn'
  playButton.setAttribute('aria-label', 'Play')
  setButtonIcon(playButton, 'play')

  const backButton = document.createElement('button')
  backButton.type = 'button'
  backButton.className = 'aislenote-media-btn aislenote-media-back-btn'
  backButton.setAttribute('aria-label', `Back ${MEDIA_SEEK_STEP_SECONDS} seconds`)
  backButton.classList.add('editor-history-toolbar-btn', 'editor-history-toolbar-btn-undo')
  setButtonIcon(backButton, 'undo')

  const forwardButton = document.createElement('button')
  forwardButton.type = 'button'
  forwardButton.className = 'aislenote-media-btn aislenote-media-forward-btn'
  forwardButton.setAttribute('aria-label', `Forward ${MEDIA_SEEK_STEP_SECONDS} seconds`)
  forwardButton.classList.add('editor-history-toolbar-btn', 'editor-history-toolbar-btn-redo')
  setButtonIcon(forwardButton, 'redo')

  const currentTime = document.createElement('span')
  currentTime.className = 'aislenote-media-time aislenote-media-time-current'
  currentTime.textContent = '0:00'

  const durationTime = document.createElement('span')
  durationTime.className = 'aislenote-media-time aislenote-media-time-duration'
  durationTime.textContent = '0:00'

  const slider = document.createElement('input')
  slider.type = 'range'
  slider.className = 'aislenote-media-slider'
  slider.min = '0'
  slider.max = '0'
  slider.step = '0.01'
  slider.value = '0'
  slider.disabled = true
  slider.setAttribute('aria-label', 'Media position')
  let sliderPointerActive = false

  const loopButton = document.createElement('button')
  loopButton.type = 'button'
  loopButton.className = 'aislenote-media-btn aislenote-media-loop-btn'
  loopButton.setAttribute('aria-label', 'Loop off')
  loopButton.setAttribute('aria-pressed', 'false')
  setButtonIcon(loopButton, 'loop')

  const speedWrap = document.createElement('span')
  speedWrap.className = 'aislenote-media-speed-wrap'

  const speedButton = document.createElement('button')
  speedButton.type = 'button'
  speedButton.className = 'aislenote-media-btn aislenote-media-speed-btn'
  speedButton.setAttribute('aria-haspopup', 'listbox')
  speedButton.textContent = formatMediaSpeedLabel(playbackSpeed)

  const speedMenu = document.createElement('span')
  speedMenu.className = 'aislenote-media-speed-menu'
  speedMenu.setAttribute('role', 'listbox')
  speedMenu.setAttribute('popover', 'manual')
  speedMenu.hidden = true

  const volumeWrap = document.createElement('span')
  volumeWrap.className = 'aislenote-media-volume-wrap'

  const volumeButton = document.createElement('button')
  volumeButton.type = 'button'
  volumeButton.className = 'aislenote-media-btn aislenote-media-volume-btn'
  volumeButton.setAttribute('aria-haspopup', 'true')

  const volumePopup = document.createElement('span')
  volumePopup.className = 'aislenote-media-volume-popup'
  volumePopup.setAttribute('popover', 'manual')
  volumePopup.hidden = true

  const volumeSlider = document.createElement('input')
  volumeSlider.type = 'range'
  volumeSlider.className = 'aislenote-media-volume-slider'
  volumeSlider.min = '0'
  volumeSlider.max = '150'
  volumeSlider.step = '1'
  volumeSlider.value = String(volumePercent)
  volumeSlider.setAttribute('aria-label', 'Media volume')

  const errorMessage = document.createElement('span')
  errorMessage.className = 'aislenote-media-error'
  errorMessage.hidden = true
  errorMessage.setAttribute('role', 'status')

  const setError = (message: string) => {
    errorMessage.textContent = message
    errorMessage.hidden = false
  }

  const clearError = () => {
    errorMessage.textContent = ''
    errorMessage.hidden = true
  }

  const syncTime = () => {
    currentTime.textContent = formatMediaTime(media.currentTime)
    if (Number.isFinite(media.duration) && media.duration > 0) {
      slider.max = String(media.duration)
      slider.disabled = false
      durationTime.textContent = formatMediaTime(media.duration)
    } else {
      slider.max = '0'
      slider.disabled = true
      durationTime.textContent = '0:00'
    }
    slider.value = getMediaSliderDisplayValue(media.currentTime, slider.value, sliderPointerActive)
  }

  const syncPlayback = () => {
    const playing = !media.paused && !media.ended
    playButton.setAttribute('aria-label', playing ? 'Pause' : 'Play')
    setButtonIcon(playButton, playing ? 'pause' : 'play')
  }

  const persistPlaybackMetadata = (metadata: { speed?: number; volume?: number }) => {
    const currentMetadata = getMediaTransformMetadata(mediaSource) ?? { v: 1 }
    const nextSource = withMediaTransformMetadata(mediaSource, {
      ...currentMetadata,
      ...metadata,
      v: 1,
    })
    if (nextSource === mediaSource) return
    mediaSource = nextSource
    wrapper.setAttribute('data-media-source', nextSource)
    onSourceChange?.(nextSource)
  }

  const syncSpeedOptions = () => {
    speedMenu.querySelectorAll<HTMLButtonElement>('.aislenote-media-speed-option').forEach((option) => {
      const optionSpeed = normalizeMediaPlaybackSpeed(option.dataset.speed)
      option.setAttribute('aria-selected', optionSpeed === playbackSpeed ? 'true' : 'false')
    })
  }

  const setPlaybackSpeed = (value: unknown, options: { persist?: boolean } = {}) => {
    const speed = normalizeMediaPlaybackSpeed(value) ?? MEDIA_DEFAULT_PLAYBACK_SPEED
    playbackSpeed = speed
    media.playbackRate = speed
    speedButton.textContent = formatMediaSpeedLabel(speed)
    speedButton.setAttribute('aria-label', `Playback speed ${formatMediaSpeedLabel(speed)}`)
    syncSpeedOptions()
    if (options.persist !== false) persistPlaybackMetadata({ speed })
  }

  const setVolumePercent = (value: unknown, options: { persist?: boolean } = {}) => {
    const volume = normalizeMediaVolumePercent(value) ?? MEDIA_DEFAULT_VOLUME_PERCENT
    volumePercent = volume
    volumeSlider.value = String(volume)
    setButtonIcon(volumeButton, getMediaVolumeIconName(volume))
    volumeButton.setAttribute('aria-label', `Volume ${volume}%`)
    applyMediaElementVolume(media, volume)
    if (options.persist !== false) persistPlaybackMetadata({ volume })
  }

  const togglePlayback = () => {
    resumeMediaElementVolumeContext(media)
    if (media.paused || media.ended) {
      clearError()
      void media.play().catch(() => {
        setError(MEDIA_PLAYBACK_ERROR_TEXT)
      })
    } else {
      media.pause()
    }
  }

  const seekBy = (deltaSeconds: number) => {
    media.currentTime = getMediaSeekTime(media.currentTime, deltaSeconds, media.duration)
    syncTime()
  }

  const handleMediaKeyDown = (event: KeyboardEvent) => {
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
      setVolumePercent(getSteppedMediaVolumePercent(volumePercent, action === 'volume-up' ? 'up' : 'down'))
      return
    }
    seekBy(action === 'seek-backward' ? -MEDIA_SEEK_STEP_SECONDS : MEDIA_SEEK_STEP_SECONDS)
  }

  const handleMediaKeyUp = (event: KeyboardEvent) => {
    if (!getMediaKeyboardAction(event)) {
      event.stopPropagation()
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  let removeDocumentPopupDismissal: (() => void) | null = null

  const isPlaybackPopupOpen = () => !speedMenu.hidden || !volumePopup.hidden

  const syncDocumentPopupDismissal = () => {
    if (!isPlaybackPopupOpen()) {
      removeDocumentPopupDismissal?.()
      removeDocumentPopupDismissal = null
      return
    }
    if (removeDocumentPopupDismissal) return
    const ownerDocument = wrapper.ownerDocument
    const handleDocumentPointerDown = (event: PointerEvent) => {
      if (isMediaPlaybackSettingsTargetForPlayer(wrapper, event.target)) return
      closePlaybackPopups()
    }
    ownerDocument.addEventListener('pointerdown', handleDocumentPointerDown, true)
    removeDocumentPopupDismissal = () => {
      ownerDocument.removeEventListener('pointerdown', handleDocumentPointerDown, true)
    }
  }

  const closePlaybackPopups = () => {
    speedMenu.hidden = true
    volumePopup.hidden = true
    syncDocumentPopupDismissal()
    syncPlaybackPopupElements()
  }

  const syncPlaybackPopupElements = () => {
    const alignment = kind === 'audio' ? 'left' : 'center'
    syncMediaPlaybackPopupElement(speedMenu, speedButton, !speedMenu.hidden, alignment)
    syncMediaPlaybackPopupElement(volumePopup, volumeButton, !volumePopup.hidden, alignment)
  }

  const closePlaybackPopupsFromPlayerClick = (event: Event) => {
    if (isMediaPlaybackSettingsTargetForPlayer(wrapper, event.target)) return
    closePlaybackPopups()
  }

  playButton.addEventListener('click', togglePlayback)
  backButton.addEventListener('click', () => seekBy(-MEDIA_SEEK_STEP_SECONDS))
  forwardButton.addEventListener('click', () => seekBy(MEDIA_SEEK_STEP_SECONDS))
  speedButton.addEventListener('click', () => {
    speedMenu.hidden = !speedMenu.hidden
    volumePopup.hidden = true
    syncPlaybackPopupElements()
    syncDocumentPopupDismissal()
  })
  for (const speed of MEDIA_SPEED_PRESETS) {
    const option = document.createElement('button')
    option.type = 'button'
    option.className = 'aislenote-media-speed-option'
    option.dataset.speed = String(speed)
    option.setAttribute('role', 'option')
    option.textContent = formatMediaSpeedLabel(speed)
    option.addEventListener('click', () => {
      setPlaybackSpeed(speed)
      speedMenu.hidden = true
      syncPlaybackPopupElements()
      syncDocumentPopupDismissal()
    })
    speedMenu.append(option)
  }
  volumeButton.addEventListener('click', () => {
    volumePopup.hidden = !volumePopup.hidden
    speedMenu.hidden = true
    syncPlaybackPopupElements()
    syncDocumentPopupDismissal()
  })
  volumeSlider.addEventListener('input', () => {
    setVolumePercent(volumeSlider.value)
  })
  const endSliderPointerInteraction = () => {
    if (!sliderPointerActive) return
    sliderPointerActive = false
    syncTime()
  }
  slider.addEventListener('pointerdown', (event) => {
    sliderPointerActive = true
    slider.setPointerCapture?.(event.pointerId)
  })
  slider.addEventListener('pointerup', endSliderPointerInteraction)
  slider.addEventListener('pointercancel', endSliderPointerInteraction)
  slider.addEventListener('change', endSliderPointerInteraction)
  slider.addEventListener('blur', endSliderPointerInteraction)
  slider.addEventListener('input', () => {
    const nextTime = Number(slider.value)
    if (Number.isFinite(nextTime)) {
      media.currentTime = getMediaSeekTime(0, nextTime, media.duration)
      syncTime()
    }
  })
  loopButton.addEventListener('click', () => {
    media.loop = !media.loop
    loopButton.setAttribute('aria-pressed', media.loop ? 'true' : 'false')
    loopButton.setAttribute('aria-label', media.loop ? 'Loop on' : 'Loop off')
  })
  setPlaybackSpeed(playbackSpeed, { persist: false })
  setVolumePercent(volumePercent, { persist: false })

  media.addEventListener('loadedmetadata', () => {
    clearError()
    syncTime()
    if (media instanceof HTMLVideoElement) {
      applyMediaMetadataToPlayer(wrapper, src, getVideoNaturalAspectRatio(media))
    }
  })
  media.addEventListener('durationchange', syncTime)
  media.addEventListener('timeupdate', syncTime)
  media.addEventListener('play', () => {
    clearError()
    syncPlayback()
  })
  media.addEventListener('pause', syncPlayback)
  media.addEventListener('ended', syncPlayback)
  media.addEventListener('error', () => {
    setError(MEDIA_LOAD_ERROR_TEXT)
  })
  wrapper.addEventListener('keydown', handleMediaKeyDown)
  wrapper.addEventListener('keyup', handleMediaKeyUp)
  wrapper.addEventListener('click', closePlaybackPopupsFromPlayerClick)
  ;['pointerdown', 'mousedown', 'click', 'beforeinput', 'paste', 'drop'].forEach((eventName) => {
    wrapper.addEventListener(eventName, stopMediaEvent)
  })

  speedWrap.append(speedButton, speedMenu)
  volumePopup.append(volumeSlider)
  volumeWrap.append(volumeButton, volumePopup)
  controls.append(
    title,
    playButton,
    loopButton,
    speedWrap,
    volumeWrap,
    currentTime,
    slider,
    durationTime,
    backButton,
    forwardButton,
    errorMessage,
  )
  if (kind === 'video') {
    const viewport = document.createElement('span')
    viewport.className = 'aislenote-media-viewport'
    assignStyles(viewport, getMediaViewportStyle(transformMetadata, DEFAULT_VIDEO_ASPECT_RATIO))
    const frame = document.createElement('span')
    frame.className = 'aislenote-media-frame'
    assignStyles(frame, getMediaFrameStyle(transformMetadata))
    assignStyles(media, getMediaVideoStyle(transformMetadata))
    frame.append(media)
    viewport.append(frame)
    wrapper.append(viewport, controls)
  } else {
    wrapper.append(media, controls)
  }
  return wrapper
}
