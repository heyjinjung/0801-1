'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getPooledPoints, releasePoints, initPointPool, generateStablePoints, ParticlePoint } from '../../lib/particles';

interface GameBackgroundProps {
  particleCount?: number;
}

export function GameBackground({ particleCount = 25 }: GameBackgroundProps) {
  const [points, setPoints] = useState<ParticlePoint[]>(() => generateStablePoints(particleCount, 777));
  const [leased, setLeased] = useState<ParticlePoint[] | null>(null);

  useEffect(() => {
    initPointPool([particleCount, particleCount * 2]);
    const pooled = getPooledPoints(particleCount, 888);
    setLeased(pooled);
    setPoints(pooled);
    return () => {
      if (pooled) releasePoints(pooled);
    };
  }, [particleCount]);

  return (
    <div className="absolute inset-0" aria-hidden>
      {points.map((p, i) => (
        <motion.div
          key={p.id ?? i}
          initial={{ opacity: 0, x: `${p.x}%`, y: `${p.y}%` }}
          animate={{ opacity: [0, 0.3, 0], scale: [0, 1.5, 0], rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
          className="absolute w-1 h-1 bg-gold rounded-full"
        />
      ))}
    </div>
  );
}