import React from 'react';
import { motion } from 'motion/react';
import { User, Activity, Flame, Users, MoreHorizontal } from 'lucide-react';
import { cn } from './MapCanvas';

export const UserMarker = ({ image, top, left }: { image: string, top: string, left: string }) => {
  return (
    <div className="absolute z-40 transform -translate-x-1/2 -translate-y-1/2" style={{ top, left }}>
      <div className="relative">
        {/* Pulsing rings */}
        <motion.div
          className="absolute inset-0 rounded-full border border-blue-400 bg-blue-500/20"
          animate={{ scale: [1, 2.5], opacity: [0.8, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut' }}
        />
        <motion.div
          className="absolute inset-0 rounded-full border border-blue-400 bg-blue-500/10"
          animate={{ scale: [1, 2], opacity: [0.6, 0] }}
          transition={{ duration: 2.5, delay: 1, repeat: Infinity, ease: 'easeOut' }}
        />
        
        {/* Avatar */}
        <div className="relative w-12 h-12 rounded-full border-2 border-blue-500 overflow-hidden shadow-[0_0_15px_rgba(59,130,246,0.6)]">
          <img src={image} alt="User Avatar" className="w-full h-full object-cover" />
        </div>
        
        {/* Badge */}
        <div className="absolute -bottom-1 -right-1 bg-blue-600 rounded-full p-0.5 border-2 border-[#0A0F1C]">
          <Activity className="w-3 h-3 text-white" />
        </div>
      </div>
    </div>
  );
};

export const PlayerMarker = ({ image, top, left, status = 'online' }: { image: string, top: string, left: string, status?: 'online' | 'looking' | 'fire' }) => {
  const statusColor = status === 'fire' ? 'border-orange-500 shadow-orange-500/50' : status === 'looking' ? 'border-purple-500 shadow-purple-500/50' : 'border-emerald-500 shadow-emerald-500/50';
  const badgeBg = status === 'fire' ? 'bg-orange-500' : status === 'looking' ? 'bg-purple-500' : 'bg-emerald-500';

  return (
    <motion.div 
      className="absolute z-20 cursor-pointer transform -translate-x-1/2 -translate-y-1/2" 
      style={{ top, left }}
      whileHover={{ scale: 1.1, zIndex: 50 }}
      whileTap={{ scale: 0.95 }}
    >
      <div className="relative group">
        <div className={cn("relative w-10 h-10 rounded-full border-2 overflow-hidden shadow-[0_0_10px_rgba(0,0,0,0)] transition-shadow duration-300 group-hover:shadow-[0_0_15px]", statusColor)}>
          <img src={image} alt="Player" className="w-full h-full object-cover" />
        </div>
        
        <div className={cn("absolute -bottom-1 -right-1 rounded-full p-[2px] border-2 border-[#0A0F1C]", badgeBg)}>
          {status === 'fire' && <Flame className="w-[10px] h-[10px] text-white" />}
          {status === 'online' && <div className="w-[10px] h-[10px] rounded-full bg-white" />}
          {status === 'looking' && <Activity className="w-[10px] h-[10px] text-white" />}
        </div>
      </div>
    </motion.div>
  );
};

export const SquadMarker = ({ images, top, left }: { images: string[], top: string, left: string }) => {
  return (
    <motion.div 
      className="absolute z-20 cursor-pointer transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center" 
      style={{ top, left }}
      whileHover={{ scale: 1.1, zIndex: 50 }}
    >
      <div className="relative flex -space-x-3 items-center p-1 rounded-full bg-slate-800/80 backdrop-blur-md border border-slate-700/50 shadow-xl">
        {images.map((img, i) => (
          <div key={i} className="w-8 h-8 rounded-full border-[1.5px] border-[#0A0F1C] overflow-hidden z-10" style={{ zIndex: 3 - i }}>
            <img src={img} alt="Squad Member" className="w-full h-full object-cover" />
          </div>
        ))}
        <div className="w-8 h-8 rounded-full border-[1.5px] border-[#0A0F1C] bg-slate-700 flex items-center justify-center -ml-3 z-0">
          <MoreHorizontal className="w-3 h-3 text-slate-300" />
        </div>
      </div>
    </motion.div>
  );
};

export const GameMarker = ({ 
  icon: Icon, 
  title, 
  sport, 
  need, 
  top, 
  left, 
  color = "orange" 
}: { 
  icon: any, 
  title: string, 
  sport: string, 
  need: number, 
  top: string, 
  left: string,
  color?: "orange" | "green" | "emerald" | "blue"
}) => {
  
  const colorMap = {
    orange: { bg: 'bg-orange-500', text: 'text-orange-500', shadow: 'shadow-orange-500/60', border: 'border-orange-500' },
    green: { bg: 'bg-emerald-500', text: 'text-emerald-500', shadow: 'shadow-emerald-500/60', border: 'border-emerald-500' },
    emerald: { bg: 'bg-emerald-500', text: 'text-emerald-500', shadow: 'shadow-emerald-500/60', border: 'border-emerald-500' },
    blue: { bg: 'bg-blue-500', text: 'text-blue-500', shadow: 'shadow-blue-500/60', border: 'border-blue-500' },
  };
  
  const c = colorMap[color];

  return (
    <motion.div 
      className="absolute z-30 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center cursor-pointer" 
      style={{ top, left }}
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 15 }}
    >
      <div className="mb-1">
        <div className="bg-slate-900/90 backdrop-blur-md rounded-full px-2 py-0.5 border border-slate-700/50 flex items-center gap-1.5 shadow-lg whitespace-nowrap">
          <span className="text-xs font-semibold text-white">{title}</span>
          <div className="w-1 h-1 rounded-full bg-slate-500" />
          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wide", c.bg, "text-slate-950")}>
            Need {need}
          </span>
        </div>
      </div>

      <div className="relative group">
        <motion.div
          className={cn("absolute -inset-2 rounded-full opacity-30 blur-sm", c.bg)}
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <div className={cn("relative w-12 h-12 rounded-full border-[2.5px] bg-slate-900 flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0)] group-hover:shadow-[0_0_30px]", c.border, c.shadow)}>
          <Icon className={cn("w-6 h-6", c.text)} />
        </div>
        <div className={cn("absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full", c.bg)} />
      </div>
    </motion.div>
  );
};
