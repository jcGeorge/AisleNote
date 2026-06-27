import React from 'react'
import {
  CROP_RATIO_PRESETS,
  normalizeCropRatioPresetId,
  type CropRatioPresetId,
} from '../../editor/crop-ratios'

void React

type CropRatioSelectProps = {
  value: string
  className?: string
  onChange: (presetId: CropRatioPresetId) => void
}

export function CropRatioSelect({ value, className = '', onChange }: CropRatioSelectProps) {
  return (
    <select
      className={['image-crop-ratio-select', className].filter(Boolean).join(' ')}
      aria-label="Crop ratio"
      value={normalizeCropRatioPresetId(value)}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => onChange(normalizeCropRatioPresetId(event.currentTarget.value))}
    >
      {CROP_RATIO_PRESETS.map((preset) => (
        <option key={preset.id} value={preset.id}>
          {preset.label}
        </option>
      ))}
    </select>
  )
}
