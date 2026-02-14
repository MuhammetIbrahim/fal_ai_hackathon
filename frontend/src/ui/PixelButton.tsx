import React from 'react'

interface PixelButtonProps {
  label: string
  onClick: () => void
  variant?: 'wood' | 'stone' | 'metal' | 'fire'
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const variantStyles: Record<string, { base: string; border: string; glow: string }> = {
  wood: {
    base: 'bg-[#2a1a0e] hover:bg-[#3a2518] text-text-light',
    border: '1px solid rgba(139,94,60,0.6)',
    glow: '0 2px 8px rgba(139,94,60,0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
  },
  stone: {
    base: 'bg-[#2a2a2e] hover:bg-[#3a3a3e] text-text-light',
    border: '1px solid rgba(107,107,107,0.5)',
    glow: '0 2px 8px rgba(107,107,107,0.1), inset 0 1px 0 rgba(255,255,255,0.06)',
  },
  metal: {
    base: 'bg-[#1e2530] hover:bg-[#2a3540] text-text-light',
    border: '1px solid rgba(90,102,114,0.5)',
    glow: '0 2px 8px rgba(90,102,114,0.15), inset 0 1px 0 rgba(255,255,255,0.08)',
  },
  fire: {
    base: 'bg-[#3a1008] hover:bg-[#4a1810] text-fire-orange',
    border: '1px solid rgba(255,140,0,0.4)',
    glow: '0 2px 12px rgba(255,140,0,0.15), 0 0 20px rgba(255,140,0,0.08), inset 0 1px 0 rgba(255,200,50,0.1)',
  },
}

const sizeStyles: Record<string, string> = {
  sm: 'px-3.5 py-1.5 text-[8px]',
  md: 'px-5 py-2.5 text-[10px]',
  lg: 'px-8 py-3 text-[11px]',
}

export const PixelButton: React.FC<PixelButtonProps> = ({
  label,
  onClick,
  variant = 'wood',
  disabled = false,
  size = 'md',
}) => {
  const v = variantStyles[variant]

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        font-pixel uppercase tracking-wider
        cursor-pointer select-none rounded
        transition-all duration-200 ease-out
        ${v.base}
        ${sizeStyles[size]}
        ${disabled
          ? 'opacity-40 cursor-not-allowed saturate-0'
          : 'hover:scale-[1.03] active:scale-[0.97]'
        }
      `}
      style={{
        border: v.border,
        boxShadow: disabled ? 'none' : v.glow,
      }}
    >
      {label}
    </button>
  )
}

export default PixelButton
