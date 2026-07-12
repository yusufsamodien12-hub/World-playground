
import React, { useMemo, useEffect, useState, useRef } from 'react';
import { KnowledgeEntry, KnowledgeCategory } from '../src/types';

interface Node {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  title: string;
  category: KnowledgeCategory;
  iteration: number;
}

interface Edge {
  source: string;
  target: string;
  type: 'category' | 'sequence';
}

const CATEGORY_COLORS: Record<KnowledgeCategory, string> = {
  Infrastructure: '#38bdf8',
  Energy: '#fbbf24',
  Environment: '#34d399',
  Architecture: '#a78bfa',
  Synthesis: '#f472b6'
};

export const KnowledgeGraph: React.FC<{ entries: KnowledgeEntry[], width?: number, height?: number }> = ({ entries, width = 350, height = 250 }) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const requestRef = useRef<number>(null);

  useEffect(() => {
    const newNodes: Node[] = entries.map((entry) => {
      const existing = nodes.find(n => n.id === entry.id);
      if (existing) return { ...existing, category: entry.category };
      return {
        id: entry.id,
        x: width / 2 + (Math.random() - 0.5) * 80,
        y: height / 2 + (Math.random() - 0.5) * 80,
        vx: 0,
        vy: 0,
        title: entry.title,
        category: entry.category,
        iteration: entry.iteration
      };
    });

    const newEdges: Edge[] = [];
    
    // 1. Sequence Chain (Chronological)
    for (let i = 0; i < entries.length - 1; i++) {
      newEdges.push({ source: entries[i].id, target: entries[i + 1].id, type: 'sequence' });
    }

    // 2. Category Chain (Topic Threading) - effectively creates a "subway map" of thought
    const lastInCategory: Record<string, string> = {};
    entries.forEach(entry => {
      if (lastInCategory[entry.category]) {
        newEdges.push({ source: lastInCategory[entry.category], target: entry.id, type: 'category' });
      }
      lastInCategory[entry.category] = entry.id;
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [entries, width, height]);

  const animate = () => {
    setNodes(prev => {
      const updated = prev.map(n => ({ ...n }));
      const repulsion = 800;
      const springK = 0.05;
      const damping = 0.88; // Higher damping = smoother but slower settling

      // 1. Repulsion (Optimized: Avoid self, max distance cap)
      for (let i = 0; i < updated.length; i++) {
        for (let j = i + 1; j < updated.length; j++) {
          const n1 = updated[i];
          const n2 = updated[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const distSq = dx * dx + dy * dy;
          
          if (distSq > 0 && distSq < 15000) { // Optimization: Ignore far away nodes
            const force = repulsion / Math.max(distSq, 100); // Robustness: Cap min distance to prevent launch
            const angle = Math.atan2(dy, dx);
            const fx = Math.cos(angle) * force;
            const fy = Math.sin(angle) * force;
            
            n1.vx -= fx; n1.vy -= fy;
            n2.vx += fx; n2.vy += fy;
          }
        }
      }

      // 2. Springs (Edges)
      edges.forEach(edge => {
        const n1 = updated.find(n => n.id === edge.source);
        const n2 = updated.find(n => n.id === edge.target);
        if (n1 && n2) {
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          // Category links are looser, Sequence links are tighter
          const targetDist = edge.type === 'category' ? 50 : 30; 
          const force = (dist - targetDist) * springK;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          n1.vx += fx; n1.vy += fy;
          n2.vx -= fx; n2.vy -= fy;
        }
      });

      // 3. Environment Forces (Wall + Center)
      updated.forEach(n => {
        // Gentle center gravity
        n.vx += (width / 2 - n.x) * 0.005;
        n.vy += (height / 2 - n.y) * 0.005;

        // Wall repulsion
        const margin = 20;
        if (n.x < margin) n.vx += 0.5;
        if (n.x > width - margin) n.vx -= 0.5;
        if (n.y < margin) n.vy += 0.5;
        if (n.y > height - margin) n.vy -= 0.5;

        // Apply Velocity
        n.x += n.vx;
        n.y += n.vy;
        
        // Dampen
        n.vx *= damping;
        n.vy *= damping;
        
        // Hard Clamp
        n.x = Math.max(10, Math.min(width - 10, n.x));
        n.y = Math.max(10, Math.min(height - 10, n.y));
      });

      return updated;
    });
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [edges]);

  return (
    <div className="relative overflow-hidden bg-black/60 rounded-3xl border border-white/5 mb-6 group" style={{ width, height }}>
      <div className="absolute top-4 left-5 z-10">
        <div className="text-[10px] font-black uppercase text-white/30 tracking-[0.3em]">Neural Topology</div>
        <div className="flex gap-2 mt-2">
          {Object.entries(CATEGORY_COLORS).map(([cat, col]) => (
            <div key={cat} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: col }} title={cat} />
          ))}
        </div>
      </div>
      <svg width={width} height={height} className="opacity-80 group-hover:opacity-100 transition-opacity">
        <defs>
          <pattern id="grid-pattern" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5"/>
          </pattern>
          <filter id="nodeGlow"><feGaussianBlur stdDeviation="2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-pattern)" />
        
        {edges.map((e, idx) => {
          const n1 = nodes.find(n => n.id === e.source);
          const n2 = nodes.find(n => n.id === e.target);
          if (!n1 || !n2) return null;
          return <line key={idx} x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y} stroke={e.type === 'sequence' ? 'rgba(255,255,255,0.08)' : CATEGORY_COLORS[nodes.find(n => n.id === e.source)?.category || 'Synthesis'] + '40'} strokeWidth={e.type === 'sequence' ? 1.5 : 0.8} />;
        })}
        {nodes.map((n, i) => {
          const color = CATEGORY_COLORS[n.category] || '#ffffff';
          return (
          <g key={n.id} filter="url(#nodeGlow)">
            {/* Pulse effect for only the latest node */}
            {i === nodes.length - 1 && (
              <circle cx={n.x} cy={n.y} r={12} fill={color} opacity="0.2">
                <animate attributeName="r" values="8;16;8" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
            <circle cx={n.x} cy={n.y} r={4.5} fill={color} className="transition-all duration-500 hover:r-6 cursor-pointer" />
            <circle cx={n.x} cy={n.y} r={8} fill="transparent" stroke={color} strokeWidth="0.5" strokeDasharray="2 2" className="animate-[spin_4s_linear_infinite]" />
            <title>{n.title} [{n.category}]</title>
          </g>
          );
        })}
      </svg>
    </div>
  );
};
