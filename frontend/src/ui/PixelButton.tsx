import React from 'react'

interface PixelButtonProps {
  label: string
  onClick: () => void
  variant?: 'wood' | 'stone' | 'metal' | 'fire'
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const variantStyles: Record<string, string> = {
  wood: 'border-wood bg-[#3a2510] hover:bg-[#4e3319] shadow-[inset_0_2px_0_rgba(255,255,255,0.1),inset_0_-2px_0_rgba(0,0,0,0.3)]',
  stone: 'border-stone bg-[#3a3a3a] hover:bg-[#4a4a4a] shadow-[inset_0_2px_0_rgba(255,255,255,0.1),inset_0_-2px_0_rgba(0,0,0,0.3)]',
  metal: 'border-metal bg-[#2a3038] hover:bg-[#3a4048] shadow-[inset_0_2px_0_rgba(255,255,255,0.15),inset_0_-2px_0_rgba(0,0,0,0.3)]',
  fire: 'border-fire-orange bg-[#5a1010] hover:bg-[#7a1a1a] shadow-[inset_0_2px_0_rgba(255,200,50,0.2),inset_0_-2px_0_rgba(0,0,0,0.3),0_0_12px_rgba(255,140,0,0.4)]',
}

const sizeStyles: Record<string, string> = {
  sm: 'px-3 py-1 text-[8px]',
  md: 'px-5 py-2 text-[10px]',
  lg: 'px-8 py-3 text-xs',
}

export const PixelButton: React.FC<PixelButtonProps> = ({
  label,
  onClick,
  variant = 'wood',
  disabled = false,
  size = 'md',
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        font-pixel text-text-light uppercase tracking-wider
        border-4 cursor-pointer select-none
        transition-all duration-150 ease-out
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:scale-105 hover:brightness-110 active:scale-95 active:brightness-90'
        }
      `}
    >
      {label}
    </button>
  )
}

export default PixelButton
