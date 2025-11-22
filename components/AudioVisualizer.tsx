import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  volume: number;
  isActive: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ volume, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let animationId: number;
    
    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;
      
      ctx.clearRect(0, 0, width, height);
      
      if (isActive) {
         // Draw animated circle based on volume
         const radius = 30 + (volume * 2); // Base radius + volume factor
         
         // Outer glow
         const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.5, centerX, centerY, radius);
         gradient.addColorStop(0, 'rgba(249, 115, 22, 0.8)'); // Orange-500
         gradient.addColorStop(1, 'rgba(249, 115, 22, 0)');
         
         ctx.beginPath();
         ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
         ctx.fillStyle = gradient;
         ctx.fill();
         
         // Inner Core
         ctx.beginPath();
         ctx.arc(centerX, centerY, 20, 0, 2 * Math.PI);
         ctx.fillStyle = '#fff';
         ctx.fill();
      } else {
         // Idle State
         ctx.beginPath();
         ctx.arc(centerX, centerY, 15, 0, 2 * Math.PI);
         ctx.fillStyle = 'rgba(148, 163, 184, 0.5)'; // Slate-400
         ctx.fill();
      }
      
      animationId = requestAnimationFrame(draw);
    };
    
    draw();
    
    return () => cancelAnimationFrame(animationId);
  }, [volume, isActive]);

  return (
    <div className="relative w-full h-64 flex items-center justify-center">
        <canvas 
            ref={canvasRef} 
            width={300} 
            height={300} 
            className="w-full h-full"
        />
        <div className="absolute bottom-4 text-slate-500 text-xs uppercase tracking-widest font-medium">
            {isActive ? "Listening..." : "Ready"}
        </div>
    </div>
  );
};
