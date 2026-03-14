import React from 'react';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function MapCanvas() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0A0F1C] pointer-events-none z-0">
      {/* Subtle Map Grid */}
      <div 
        className="absolute inset-0"
        style={{
          backgroundImage: 'linear-gradient(to right, rgba(30, 41, 59, 0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(30, 41, 59, 0.4) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }}
      />
      
      {/* Stylized Streets / Paths */}
      <svg className="absolute inset-0 w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M-50 150 Q 150 200, 200 400 T 500 700" stroke="rgba(51, 65, 85, 0.5)" strokeWidth="6" strokeLinecap="round" />
        <path d="M100 -50 L 200 400 L 50 800" stroke="rgba(51, 65, 85, 0.8)" strokeWidth="12" strokeLinecap="round" />
        <path d="M450 -50 L 350 200 L 600 350 L 500 800" stroke="rgba(51, 65, 85, 0.4)" strokeWidth="8" strokeLinecap="round" />
        <path d="M-50 550 Q 200 600, 300 450 T 600 500" stroke="rgba(51, 65, 85, 0.6)" strokeWidth="4" strokeLinecap="round" />
      </svg>

      {/* Activity Heat Zones */}
      <div className="absolute top-[15%] left-[10%] w-[350px] h-[350px] bg-emerald-500/15 rounded-full blur-[80px]" />
      <div className="absolute top-[40%] right-[-15%] w-[450px] h-[450px] bg-orange-500/15 rounded-full blur-[100px]" />
      <div className="absolute bottom-[5%] left-[20%] w-[300px] h-[300px] bg-blue-500/10 rounded-full blur-[70px]" />

      {/* Walkable Radius Ring for the user (centered roughly) */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60%] w-[280px] h-[280px] rounded-full border border-white/10" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60%] w-[450px] h-[450px] rounded-full border border-white/5" />
    </div>
  );
}
