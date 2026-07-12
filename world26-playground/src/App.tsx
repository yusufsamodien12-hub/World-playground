
import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense, lazy } from 'react';
import { KnowledgeGraph } from '../components/KnowledgeGraph';
import { WorldObject, LogEntry, SimulationState, KnowledgeEntry, GroundingLink, ConstructionPlan, KnowledgeCategory, WorldObjectType } from './types';
import { requestAgentDecision, AIActionResponse } from '../services/agentClient';
import { loadSimulationState, saveSimulationState } from '../services/memoryService';
import { logger } from '../services/logger';
import { generateId } from '../services/id';

const SimulationCanvas = lazy(() => import('../components/SimulationCanvas'));

const INITIAL_GOAL = "Synthesize Sustainable Modular Settlement";

const getTerrainHeight = (x: number, z: number) => {
  const height = (Math.sin(x * 0.1) * Math.cos(z * 0.1) * 2.0) +
                 (Math.sin(x * 0.02) * Math.cos(z * 0.02) * 5.0);
  return roundToPrecision(height, 3);
};

const roundToPrecision = (value: number, decimals = 3): number => Number(value.toFixed(decimals));

const normalizePosition = (position: [number, number, number]): [number, number, number] => [
  roundToPrecision(position[0], 3),
  roundToPrecision(position[1], 3),
  roundToPrecision(position[2], 3)
];

const formatMetricLength = (meters: number): string => {
  if (!Number.isFinite(meters)) return '0.000 m';
  const abs = Math.abs(meters);
  if (abs < 1) {
    const millimeters = meters * 1000;
    return `${millimeters.toFixed(2)} mm (${meters.toFixed(4)} m)`;
  }
  if (abs < 1000) {
    const centimeters = meters * 100;
    return `${meters.toFixed(3)} m (${centimeters.toFixed(1)} cm)`;
  }
  const km = meters / 1000;
  const remainder = meters % 1000;
  return remainder === 0
    ? `${km.toFixed(3)} km`
    : `${km.toFixed(3)} km (${remainder.toFixed(3)} m)`;
};

const formatPositionWithUnits = (position: [number, number, number]): string => (
  `[${position.map(coord => formatMetricLength(coord)).join(', ')}]`
);

const VALID_PLAN_TYPES: WorldObjectType[] = [
  'wall', 'roof', 'door', 'crop', 'tree', 'well', 'fence', 'modular_unit', 'solar_panel', 'water_collector'
];

const normalizeConstructionPlan = (
  plan?: ConstructionPlan,
  fallbackObjective?: string
): ConstructionPlan | undefined => {
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length < 5 || plan.steps.length > 12) {
    return undefined;
  }

  const normalizedSteps = plan.steps.map((step, index) => {
    const position = Array.isArray(step.position) && step.position.length >= 3
      ? [Number(step.position[0]), Number(step.position[1]), Number(step.position[2])] as [number, number, number]
      : [0, 0, 0] as [number, number, number];

    const status = step.status && ['pending', 'active', 'completed'].includes(step.status)
      ? step.status
      : (index === 0 ? 'active' : 'pending');

    const type = VALID_PLAN_TYPES.includes(step.type) ? step.type : 'modular_unit';
    const label = typeof step.label === 'string' && step.label.trim().length > 0 ? step.label : `${type} step ${index + 1}`;

    return {
      ...step,
      type,
      label,
      position,
      status
    };
  });

  if (normalizedSteps.some(step => step.position.some(coord => !Number.isFinite(coord)))) {
    return undefined;
  }

  const positions = new Set(normalizedSteps.map(step => step.position.join(',')));
  if (positions.size !== normalizedSteps.length) {
    return undefined;
  }

  const activeCount = normalizedSteps.filter(step => step.status === 'active').length;
  if (activeCount !== 1) {
    const firstActiveIndex = normalizedSteps.findIndex(step => step.status === 'active');
    const correctedSteps = normalizedSteps.map((step, index) => {
      if (firstActiveIndex >= 0) {
        if (index < firstActiveIndex) return { ...step, status: 'completed' as const };
        if (index === firstActiveIndex) return { ...step, status: 'active' as const };
        return { ...step, status: 'pending' as const };
      }
      if (index === 0) return { ...step, status: 'active' as const };
      return { ...step, status: 'pending' as const };
    });
    return {
      ...plan,
      objective: plan.objective || fallbackObjective || 'Architectural Synthesis',
      currentStepIndex: firstActiveIndex >= 0 ? firstActiveIndex : 0,
      planId: plan.planId || generateId(),
      steps: correctedSteps
    };
  }

  const activeIndex = normalizedSteps.findIndex(step => step.status === 'active');
  const resolvedSteps = normalizedSteps.map((step, index) => {
    if (index < activeIndex) return { ...step, status: 'completed' as const };
    if (index === activeIndex) return { ...step, status: 'active' as const };
    return { ...step, status: 'pending' as const };
  });

  return {
    ...plan,
    objective: plan.objective || fallbackObjective || 'Architectural Synthesis',
    currentStepIndex: activeIndex,
    planId: plan.planId || generateId(),
    steps: resolvedSteps
  };
};

const getFallbackMesh = (type: WorldObjectType) => {
  switch (type) {
    case 'wall':
      return {
        materialResearch: 'Reinforced composite wall with visible support ribs.',
        parts: [
          { geometry: 'box', args: [1.2, 2.1, 0.2], position: [0, 1.05, 0], rotation: [0, 0, 0], material: { color: '#8f9ca8', roughness: 0.8, metalness: 0.1 } },
          { geometry: 'box', args: [0.1, 2.1, 0.2], position: [-0.55, 1.05, 0], rotation: [0, 0, 0], material: { color: '#4b5563', roughness: 0.7, metalness: 0.2 } },
          { geometry: 'box', args: [0.1, 2.1, 0.2], position: [0.55, 1.05, 0], rotation: [0, 0, 0], material: { color: '#4b5563', roughness: 0.7, metalness: 0.2 } },
        ]
      };
    case 'roof':
      return {
        materialResearch: 'Sloped modular roof panels with a reinforced ridge.',
        parts: [
          { geometry: 'box', args: [1.4, 0.18, 1.4], position: [0, 0.1, 0], rotation: [0, 0, 0], material: { color: '#7c2d12', roughness: 0.88, metalness: 0.05 } },
          { geometry: 'box', args: [1.4, 0.18, 0.3], position: [0, 0.25, 0.55], rotation: [0, 0, 0], material: { color: '#9d3411', roughness: 0.88, metalness: 0.05 } },
        ]
      };
    case 'door':
      return {
        materialResearch: 'Simple wooden door with a brass handle accent.',
        parts: [
          { geometry: 'box', args: [0.7, 1.9, 0.14], position: [0, 0.95, 0], rotation: [0, 0, 0], material: { color: '#764f28', roughness: 0.7, metalness: 0.03 } },
          { geometry: 'cylinder', args: [0.05, 0.05, 0.2, 12], position: [0.28, 0.95, 0.08], rotation: [0, 0, Math.PI / 2], material: { color: '#d5a021', roughness: 0.3, metalness: 0.85 } },
        ]
      };
    case 'modular_unit':
      return {
        materialResearch: 'Modular housing block with panelized siding and reinforced edges.',
        parts: [
          { geometry: 'box', args: [1.4, 1.2, 1.2], position: [0, 0.6, 0], rotation: [0, 0, 0], material: { color: '#1f2937', roughness: 0.5, metalness: 0.25 } },
          { geometry: 'box', args: [1.4, 0.1, 0.05], position: [0, 0.55, 0.6], rotation: [0, 0, 0], material: { color: '#334155', roughness: 0.8, metalness: 0.2 } },
          { geometry: 'box', args: [1.4, 0.1, 0.05], position: [0, 0.55, -0.6], rotation: [0, 0, 0], material: { color: '#334155', roughness: 0.8, metalness: 0.2 } },
        ]
      };
    default:
      return undefined;
  }
};

const buildFallbackHousePlan = (anchor: [number, number, number], objective: string): ConstructionPlan => {
  const [x, y, z] = anchor;
  const wallOffset = 1.25; // align walls to the edges of a 2.5m foundation
  const doorOffset = 1.0; // place door at the front facade center
  return {
    planId: generateId(),
    objective,
    currentStepIndex: 0,
    steps: [
      { label: 'Foundation', type: 'modular_unit', position: [x, y, z], status: 'active', customMesh: getFallbackMesh('modular_unit') },
      { label: 'Wall East', type: 'wall', position: [x + wallOffset, y, z], status: 'pending', customMesh: getFallbackMesh('wall') },
      { label: 'Wall West', type: 'wall', position: [x - wallOffset, y, z], status: 'pending', customMesh: getFallbackMesh('wall') },
      { label: 'Roof', type: 'roof', position: [x, y + 2, z], status: 'pending', customMesh: getFallbackMesh('roof') },
      { label: 'Door', type: 'door', position: [x, y, z - doorOffset], status: 'pending', customMesh: getFallbackMesh('door') }
    ]
  };
};

function App() {
  logger.info('App', '🚀 App component initializing');
  logger.info('App', 'Environment', { 
    isDev: import.meta.env.DEV, 
    mode: import.meta.env.MODE,
  });
  
  const [state, setState] = useState<SimulationState>({
    objects: [],
    logs: [{ id: '1', type: 'success', message: 'Architect-OS Online. Neural pathways clear.', timestamp: Date.now() }],
    knowledgeBase: [],
    currentGoal: INITIAL_GOAL,
    learningIteration: 0,
    networkStatus: 'uplink_active',
    activePlan: undefined,
    progression: {
      complexityLevel: 1,
      structuresCompleted: 0,
      totalBlocks: 0,
      unlockedBlueprints: ['Core Protocol', 'Adaptive Clustering']
    },
    apiMetrics: [],
    ui: { showStats: true, showKnowledge: true, showLogs: true, showPlanning: true, showNetwork: true, showLegend: true }
  });

  const [avatarPos, setAvatarPos] = useState<[number, number, number]>([0, 0, 0]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAuto, setIsAuto] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [showMaterials, setShowMaterials] = useState(false);
  const [currentTask, setCurrentTask] = useState<string>("Analyzing Local Sector...");
  const [taskProgress, setTaskProgress] = useState(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'action') => {
    setState(prev => ({
      ...prev,
      logs: [...prev.logs, { id: generateId(), type, message, timestamp: Date.now() }]
    }));
  }, []);

  const materialsInventory = useMemo(() => {
    const placed = state.objects
      .filter(obj => obj.customMesh)
      .map(obj => ({
        id: obj.id,
        label: `${obj.type} (placed)`,
        type: obj.type,
        position: obj.position,
        customMesh: obj.customMesh!
      }));

    const planned = state.activePlan?.steps
      .filter(step => step.customMesh)
      .map((step, index) => ({
        id: `plan-${index}-${step.label}`,
        label: `${step.label} (${step.type})`,
        type: step.type,
        position: step.position,
        customMesh: step.customMesh!
      })) || [];

    return [...placed, ...planned];
  }, [state.objects, state.activePlan]);

  // Load state on mount
  useEffect(() => {
    logger.info('App', '🔄 Initializing memory system');
    async function initMemory() {
      try {
        const savedState = await loadSimulationState();
        if (savedState) {
          logger.info('App', '✅ Loaded saved state', { 
            objects: savedState.objects?.length,
            logs: savedState.logs?.length,
            knowledge: savedState.knowledgeBase?.length
          });
          setState(prev => ({
            ...prev,
            ...savedState,
            // Ensure UI settings and metrics aren't wiped if missing in save
            ui: savedState.ui || prev.ui,
            apiMetrics: savedState.apiMetrics || prev.apiMetrics,
            logs: savedState.logs || prev.logs
          }));
          
          addLog("Neural Memory Restored: Continuing previous simulation.", "success");
          
          if (savedState.objects && savedState.objects.length > 0) {
            setAvatarPos(savedState.objects[savedState.objects.length - 1].position);
          }
        }
      } catch (err) {
        console.error("Memory initialization failed:", err);
      }
    }
    initMemory();
  }, [addLog]);

  // Auto-save state whenever significant changes occur
  useEffect(() => {
    const timer = setTimeout(() => {
      if (state.objects.length > 0 || state.knowledgeBase.length > 0) {
        saveSimulationState(state);
      }
    }, 5000); 
    return () => clearTimeout(timer);
  }, [state.objects, state.knowledgeBase, state.progression, state.activePlan]);


  const runSimulationStep = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setState(prev => ({ ...prev, networkStatus: 'syncing' }));
    setTaskProgress(5);

    // Initial deterministic logs to show "immediate" feedback
    addLog("Initiating Neural Uplink...", "thinking");
    await new Promise(r => setTimeout(r, 400));
    addLog("Accessing local sector topology map...", "thinking");
    await new Promise(r => setTimeout(r, 600));
    setTaskProgress(20);
    const apiStartTime = Date.now();

    try {
      const decision: AIActionResponse = await requestAgentDecision({
        logs: state.logs,
        objects: state.objects,
        currentGoal: state.currentGoal,
        knowledgeBase: state.knowledgeBase,
        activePlan: state.activePlan,
      });
      
      const apiLatency = Date.now() - apiStartTime;
      setState(prev => ({
        ...prev,
        apiMetrics: [...prev.apiMetrics, { id: generateId(), timestamp: Date.now(), latency: apiLatency, status: 'success' as const }].slice(-20)
      }));

      setTaskProgress(40);
      addLog("Neural Uplink Successful. Processing synthesis packets...", "success");
      
      // Stream AI reasoning steps line by line
      if (decision.reasoningSteps && decision.reasoningSteps.length > 0) {
        for (const step of decision.reasoningSteps) {
          addLog(`[REASONING]: ${step}`, 'thinking');
          await new Promise(r => setTimeout(r, 600)); // Simulate thinking per line
        }
      }

      setCurrentTask(decision.taskLabel);
      if (decision.outcomeSummary) {
        addLog(`Outcome summary: ${decision.outcomeSummary}`, 'thinking');
      }
      if (decision.decisionFactors && decision.decisionFactors.length > 0) {
        addLog(`Decision factors: ${decision.decisionFactors.join(', ')}`, 'thinking');
      }
      if (decision.connectivityConfirmation) {
        addLog(`Connectivity: ${decision.connectivityConfirmation}`, 'thinking');
      }
      setTaskProgress(70);

      if (decision.action === 'PLACE') {
        const normalizedIncomingPlan = normalizeConstructionPlan(
          decision.plan,
          decision.taskLabel || 'Architectural Synthesis'
        );
        const normalizedActivePlan = normalizeConstructionPlan(state.activePlan);
        let nextPlan = normalizedIncomingPlan || normalizedActivePlan;

        if (decision.plan && !normalizedIncomingPlan) {
          logger.warn('App', 'Discarded invalid incoming plan from AI; using fallback or active plan instead.', { plan: decision.plan });
          addLog('Invalid AI plan detected; using fallback or continuing existing plan.', 'error');
        }

        if (!nextPlan) {
          const anchor = state.objects[state.objects.length - 1]?.position || [0, 0, 0];
          nextPlan = buildFallbackHousePlan(anchor as [number, number, number], decision.reason || 'Shelter');
          addLog('No valid plan available; assembling a fallback house blueprint.', 'thinking');
        }

        const currentStep = nextPlan?.steps?.[nextPlan.currentStepIndex];
        if (nextPlan && !currentStep) {
          logger.warn('App', 'Received plan with invalid currentStepIndex, discarding plan', { plan: nextPlan });
          nextPlan = undefined;
        }
        const resolvedObjectType = decision.objectType === 'floor' ? 'modular_unit' : decision.objectType;
        const targetType = resolvedObjectType || currentStep?.type || 'modular_unit';
        let targetPos = decision.position || currentStep?.position || [0, 0, 0];

        if (!Array.isArray(targetPos) || targetPos.length !== 3) {
          targetPos = currentStep?.position || [0, 0, 0];
        }

        const x = Number(targetPos[0]);
        const yCandidate = Number(targetPos[1]);
        const z = Number(targetPos[2]);
        const y = Number.isFinite(yCandidate) ? yCandidate : getTerrainHeight(x, z);
        targetPos = normalizePosition([x, y, z]);

        addLog(`Synthesis Confirmed: Deploying ${targetType} unit at ${formatPositionWithUnits(targetPos)}.`, 'success');
        const meshResearch = decision.customMesh?.materialResearch || currentStep?.customMesh?.materialResearch;
        if (meshResearch) {
          addLog(`Material research: ${meshResearch}`, 'thinking');
        }
        setAvatarPos(targetPos as [number, number, number]);
        
        await new Promise(r => setTimeout(r, 800));
        setTaskProgress(100);

        const newObj: WorldObject = {
          id: generateId(),
          type: targetType as any,
          position: targetPos as [number, number, number],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          timestamp: Date.now(),
          customMesh: decision.customMesh || currentStep?.customMesh
        };

        setState(prev => {
          let updatedPlan = normalizeConstructionPlan(nextPlan, decision.taskLabel || 'Architectural Synthesis');
          if (updatedPlan && updatedPlan.steps && updatedPlan.steps[updatedPlan.currentStepIndex]) {
            const steps = [...updatedPlan.steps];
            steps[updatedPlan.currentStepIndex] = {
              ...steps[updatedPlan.currentStepIndex],
              status: 'completed'
            };

            const nextIdx = updatedPlan.currentStepIndex + 1;

            if (nextIdx < steps.length) {
              steps[nextIdx] = {
                ...steps[nextIdx],
                status: 'active'
              };
              updatedPlan = { ...updatedPlan, steps, currentStepIndex: nextIdx };
            } else {
              updatedPlan = undefined;
              addLog("Strategic Objective Achieved.", "success");
            }
          } else {
            logger.warn('App', 'Plan became invalid during update; discarding plan.', { updatedPlan });
            updatedPlan = undefined;
          }

          const newKnowledge = [...prev.knowledgeBase];
          const titleCandidate = decision.learningNote?.split(':')[0]?.trim() || "Synthesis Logic";
          
          if (!newKnowledge.find(k => k.title === titleCandidate)) {
            newKnowledge.push({
              id: generateId(),
              title: titleCandidate,
              description: decision.learningNote,
              category: decision.knowledgeCategory,
              iteration: prev.learningIteration,
              timestamp: Date.now(),
              links: decision.groundingLinks
            });
          }

          return {
            ...prev,
            objects: [...prev.objects, newObj],
            learningIteration: prev.learningIteration + 1,
            activePlan: updatedPlan,
            knowledgeBase: newKnowledge,
            progression: {
              ...prev.progression,
              totalBlocks: prev.progression.totalBlocks + 1,
              complexityLevel: Math.floor((prev.progression.totalBlocks + 1) / 5) + 1,
              structuresCompleted: prev.progression.structuresCompleted + (targetType === 'modular_unit' ? 1 : 0)
            }
          };
        });
      } else if (decision.action === 'MOVE' && decision.position) {
        setAvatarPos([decision.position[0], getTerrainHeight(decision.position[0], decision.position[2]), decision.position[2]]);
        addLog(`Relocating: Optimizing sector positioning.`, 'action');
      } else {
        addLog(`Simulation standby: ${decision.reason}`, 'action');
      }
    } catch (e) {
      addLog("Critical neural desync. Link unstable.", "error");
      setState(prev => ({ 
        ...prev, 
        networkStatus: 'error',
        apiMetrics: [...prev.apiMetrics, { id: generateId(), timestamp: Date.now(), latency: Date.now() - apiStartTime, status: 'error' as const }].slice(-20) 
      }));
    } finally {
      setIsProcessing(false);
      setTaskProgress(0);
      setState(prev => ({ 
        ...prev, 
        networkStatus: prev.networkStatus === 'error' ? 'error' : 'uplink_active' 
      }));
      setCurrentTask(isAuto ? "Scanning Topology..." : "Standby");
    }
  }, [isProcessing, state, isAuto, addLog]);

  useEffect(() => {
    if (isAuto && !isProcessing) {
      const t = setTimeout(runSimulationStep, 4500);
      return () => clearTimeout(t);
    }
  }, [isAuto, isProcessing, runSimulationStep]);

  useEffect(() => {
    if (logContainerRef.current) logContainerRef.current.scrollTo({ top: logContainerRef.current.scrollHeight, behavior: 'smooth' });
  }, [state.logs]);

  return (
    <div className="relative w-full h-screen overflow-hidden text-slate-200 bg-slate-950 font-sans">
      {/* SCANNING OVERLAY */}
      <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden opacity-20">
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,rgba(56,189,248,0.05)_50%,transparent_100%)] animate-[scan_8s_linear_infinite]" style={{ backgroundSize: '100% 200%' }} />
      </div>

      {/* HUD CONTROLS */}
      <div className="absolute top-8 right-8 z-20 flex flex-col gap-3 items-end">
        <div className="flex bg-black/40 backdrop-blur-xl p-1.5 rounded-2xl border border-white/5 shadow-2xl flex-wrap gap-2">
          {['Stats', 'Knowledge', 'Planning', 'Logs', 'Network', 'Legend', 'Materials'].map((k) => (
            <button key={k} onClick={() => {
              if (k === 'Legend') {
                setShowLegend(prev => !prev);
                return;
              }
              if (k === 'Materials') {
                setShowMaterials(prev => !prev);
                return;
              }
              setState(p => ({ ...p, ui: { ...p.ui, [`show${k}`]: !p.ui[`show${k}` as keyof SimulationState['ui']] } }));
            }}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${k === 'Legend' ? (showLegend ? 'bg-white text-slate-950 shadow-[0_0_15px_rgba(255,255,255,0.2)]' : 'text-white/40 hover:text-white') : k === 'Materials' ? (showMaterials ? 'bg-white text-slate-950 shadow-[0_0_15px_rgba(255,255,255,0.2)]' : 'text-white/40 hover:text-white') : state.ui[`show${k}` as keyof SimulationState['ui']] ? 'bg-white text-slate-950 shadow-[0_0_15px_rgba(255,255,255,0.2)]' : 'text-white/40 hover:text-white'}`}>
              {k === 'Knowledge' ? 'Neural' : k === 'Network' ? 'API Graph' : k}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-full border border-white/5 backdrop-blur-md transition-all duration-500">
          <div className={`w-2 h-2 rounded-full ${
            state.networkStatus === 'syncing' ? 'bg-sky-400 animate-ping' : 
            state.networkStatus === 'error' ? 'bg-red-500 shadow-[0_0_15px_#ef4444]' :
            'bg-emerald-400 shadow-[0_0_15px_#10b981]'
          }`} />
          <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${
            state.networkStatus === 'syncing' ? 'text-sky-400' : 
            state.networkStatus === 'error' ? 'text-red-500' :
            'text-emerald-400'
          }`}>
            Uplink: {
              state.networkStatus === 'syncing' ? 'SYNCING...' : 
              state.networkStatus === 'error' ? 'LINK ERROR' :
              'ACTIVE / SUCCESS'
            }
          </span>
        </div>
      </div>

      {/* LEFT SIDEBAR DASHBOARD */}
      <div className="absolute top-8 left-8 bottom-24 w-80 flex flex-col gap-4 z-20 pointer-events-none">
        
        {/* STATS PANEL */}
        {state.ui.showStats && (
          <div className="pointer-events-auto p-6 bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-[30px] shadow-2xl animate-in slide-in-from-left-8 duration-700 flex flex-col gap-6 shrink-0 panel-glow">
             {/* Header */}
             <div className="flex items-center gap-4">
              <div className="w-1.5 h-12 bg-sky-400 rounded-full shadow-[0_0_20px_#38bdf8]" />
              <div>
                <h1 className="text-2xl font-black italic tracking-tighter text-white leading-none">OS.ALPHA <span className="text-[10px] text-sky-400 align-top">v1.2</span></h1>
                <div className="text-[9px] font-mono text-white/40 tracking-[0.3em] mt-1 uppercase">Complexity: Tier {state.progression.complexityLevel}</div>
              </div>
            </div>
            
            {/* Task Bar */}
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
              <span className="text-[8px] font-black uppercase text-white/30 tracking-widest block mb-2">Architectural State</span>
              <p className="text-xs font-bold text-sky-100">{currentTask}</p>
              {isProcessing && <div className="mt-3 h-0.5 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-sky-400 transition-all duration-700" style={{ width: `${taskProgress}%` }} /></div>}
            </div>

            {/* Grid Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 p-3 rounded-2xl border border-white/5"><div className="text-[7px] font-black text-white/20 uppercase mb-1">Structures</div><div className="text-xl font-mono font-bold text-white">{state.progression.structuresCompleted}</div></div>
              <div className="bg-white/5 p-3 rounded-2xl border border-white/5"><div className="text-[7px] font-black text-white/20 uppercase mb-1">Knowledge</div><div className="text-xl font-mono font-bold text-white">{state.knowledgeBase.length}</div></div>
            </div>

             {/* Resources Breakdown */}
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <div className="text-[8px] font-black text-white/20 uppercase mb-2">Modules Deployed</div>
                <div className="grid grid-cols-2 gap-2 text-[9px] font-mono text-white/50">
                    <div className="flex justify-between"><span>INFRA</span> <span className="text-white">{state.objects.filter(o => ['wall', 'door', 'fence', 'roof'].includes(o.type)).length}</span></div>
                    <div className="flex justify-between"><span>ECO</span> <span className="text-white">{state.objects.filter(o => ['tree', 'crop', 'well'].includes(o.type)).length}</span></div>
                    <div className="flex justify-between"><span>NRG</span> <span className="text-white">{state.objects.filter(o => ['solar_panel', 'water_collector'].includes(o.type)).length}</span></div>
                    <div className="flex justify-between"><span>MOD</span> <span className="text-white">{state.objects.filter(o => o.type === 'modular_unit').length}</span></div>
                </div>
            </div>
          </div>
        )}

        {/* API GRAPH PANEL */}
        {state.ui.showNetwork && (
          <div className="pointer-events-auto h-32 bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-[30px] shadow-2xl animate-in slide-in-from-left-8 duration-500 overflow-hidden flex flex-col shrink-0 panel-glow">
             <div className="px-5 py-3 border-b border-white/5 flex justify-between items-center bg-white/5">
              <span className="text-[9px] font-black uppercase text-emerald-400 tracking-[0.3em]">Neural Uplink</span>
              <div className="flex gap-1">
                 <div className="w-1 h-1 rounded-full bg-emerald-500"></div>
                 <div className="w-1 h-1 rounded-full bg-red-500"></div>
              </div>
            </div>
            <div className="flex-1 relative flex items-end justify-between px-5 pb-2 pt-4 gap-0.5">
               {/* Dynamic Bars */}
               {state.apiMetrics.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-[9px] uppercase tracking-widest text-white/20">No Data Stream</div>}
               {state.apiMetrics.map((m) => {
                 const heightPct = Math.min(100, (m.latency / 2000) * 100); 
                 return (
                   <div key={m.id} className="flex-1 flex flex-col justify-end items-center group relative h-full">
                     <div 
                      style={{ height: `${Math.max(5, heightPct)}%` }} 
                      className={`w-full rounded-t-[1px] transition-all duration-500 ${m.status === 'success' ? 'bg-emerald-400/80 group-hover:bg-emerald-300' : 'bg-red-500/80 group-hover:bg-red-400'}`}
                     />
                   </div>
                 );
               })}
               <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white/5 border-t border-dashed border-white/10 pointer-events-none"></div>
            </div>
          </div>
        )}

        {/* LOGS PANEL */}
        {state.ui.showLogs && (
            <div className="pointer-events-auto flex-1 min-h-[150px] bg-slate-950/60 backdrop-blur-xl border border-white/10 rounded-[30px] overflow-hidden shadow-2xl animate-in slide-in-from-left-8 duration-700 flex flex-col panel-glow">
            <div className="px-6 py-4 border-b border-white/5 text-[9px] font-black uppercase text-white/30 tracking-[0.3em]">Direct Activity Link</div>
            <div ref={logContainerRef} className="flex-1 overflow-y-auto p-6 space-y-2 font-mono text-[9px]">
                {state.logs.map(log => (
                <div key={log.id} className={`flex gap-3 p-2 rounded-lg transition-all duration-300 ${log.type === 'success' ? 'bg-emerald-500/10 text-emerald-300' : log.type === 'error' ? 'bg-rose-500/10 text-rose-300' : log.type === 'thinking' ? 'bg-sky-500/5 text-sky-400/80 italic border-l block pl-2 border-sky-400/30' : 'bg-white/5 text-white/50'}`}>
                    <span className="opacity-30 shrink-0">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                    <span className="font-bold">{log.message}</span>
                </div>
                ))}
            </div>
            </div>
        )}

        {/* MATERIALS PANEL */}
        {showMaterials && (
          <div className="pointer-events-auto max-h-[260px] overflow-y-auto bg-slate-950/60 backdrop-blur-xl border border-white/10 rounded-[30px] shadow-2xl animate-in slide-in-from-left-8 duration-700 p-6 panel-glow">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[9px] font-black uppercase text-emerald-400 tracking-[0.3em]">AI Mesh Materials</div>
                <div className="text-[11px] font-bold text-white">Inspect generated material specs</div>
              </div>
              <div className="text-[8px] font-mono text-slate-400">{materialsInventory.length} items</div>
            </div>
            {materialsInventory.length === 0 ? (
              <div className="py-20 text-center text-[10px] font-black uppercase text-white/30 tracking-[0.3em]">No AI mesh materials available yet.</div>
            ) : (
              <div className="space-y-4">
                {materialsInventory.slice().map((item) => (
                  <div key={item.id} className="p-4 rounded-3xl bg-white/5 border border-white/10">
                    <div className="flex justify-between items-start gap-3 mb-3">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-sky-300">{item.label}</div>
                        <div className="text-[9px] font-mono text-slate-300">{formatPositionWithUnits(item.position)}</div>
                      </div>
                      <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/40">{item.type}</span>
                    </div>
                    <div className="text-[10px] font-bold text-white mb-2">Material research</div>
                    <p className="text-[10px] text-white/60 leading-relaxed">{item.customMesh.materialResearch}</p>
                    <div className="mt-3 text-[9px] uppercase tracking-[0.25em] text-slate-400 font-black">Parts</div>
                    <div className="mt-2 grid grid-cols-1 gap-2">
                      {item.customMesh.parts.map((part, partIndex) => (
                        <div key={`${item.id}-part-${partIndex}`} className="rounded-2xl bg-slate-950/70 p-3 border border-white/5">
                          <div className="flex justify-between items-center gap-2 mb-2">
                            <span className="text-[10px] font-bold text-white">{part.geometry.toUpperCase()}</span>
                            <span className="text-[8px] text-slate-400">#{partIndex + 1}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[9px] text-slate-300">
                            <div><span className="font-semibold text-white">Args:</span> {JSON.stringify(part.args)}</div>
                            <div><span className="font-semibold text-white">Pos:</span> {formatPositionWithUnits(part.position as [number, number, number])}</div>
                            <div><span className="font-semibold text-white">Rot:</span> {JSON.stringify(part.rotation)}</div>
                            <div><span className="font-semibold text-white">Mat:</span> {part.material ? JSON.stringify(part.material) : 'default'}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

       {/* PLANNING HUD */}
       {state.ui.showPlanning && state.activePlan && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 w-[420px] p-6 bg-black/60 backdrop-blur-3xl border border-white/10 rounded-[40px] shadow-2xl animate-in fade-in zoom-in-95 duration-500">
          <div className="flex flex-col gap-1 mb-4 text-center">
            <span className="text-[9px] font-black uppercase text-emerald-400 tracking-[0.4em]">Current Objective</span>
            <h2 className="text-lg font-black italic uppercase tracking-tighter text-white">{state.activePlan.objective || "Strategic Synthesis"}</h2>
          </div>
          <div className="space-y-2">
            {state.activePlan.steps.map((step, idx) => (
              <div key={idx} className={`relative flex flex-col gap-2 p-3 rounded-xl border transition-all duration-500 ${step.status === 'active' ? 'bg-emerald-500/10 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : step.status === 'completed' ? 'bg-white/5 border-white/10 opacity-40' : 'bg-transparent border-white/5 opacity-20'}`}>
                <div className="flex items-center gap-3 justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-1.5 h-1.5 rounded-full ${step.status === 'active' ? 'bg-emerald-400 animate-pulse' : step.status === 'completed' ? 'bg-white' : 'bg-white/20'}`} />
                    <span className="text-[10px] font-bold tracking-tight uppercase">{step.label}</span>
                  </div>
                  <span className="text-[8px] font-mono text-white/30">[{step.type.toUpperCase()}]</span>
                </div>
                <div className="text-[8px] font-mono text-slate-300/70">{formatPositionWithUnits(step.position)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NEURAL DB PANEL */}
      {state.ui.showKnowledge && (
        <div className="absolute top-24 right-8 z-20 w-[440px] max-h-[75vh] flex flex-col bg-slate-950/60 backdrop-blur-3xl border border-white/10 rounded-[40px] shadow-2xl overflow-hidden animate-in slide-in-from-right-8 duration-700 panel-glow">
          <div className="p-8 bg-white/5 border-b border-white/10 flex justify-between items-center">
            <span className="text-sm font-black uppercase text-white tracking-[0.3em]">Neural Repository</span>
            <div className="w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_10px_#6366f1] animate-pulse" />
          </div>
          <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
            {state.knowledgeBase.length > 0 && <KnowledgeGraph entries={state.knowledgeBase} width={370} height={240} />}
            {state.knowledgeBase.length === 0 ? (
              <div className="py-24 text-center opacity-20 text-[10px] font-black uppercase tracking-[0.4em]">Awaiting Uplink...</div>
            ) : (
              state.knowledgeBase.slice().reverse().map((k) => (
                <div key={k.id} className="p-6 bg-white/5 rounded-3xl border border-white/5 hover:border-white/20 transition-all duration-300">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[10px] font-black text-sky-400 uppercase tracking-widest">{k.category}</span>
                    <span className="text-[8px] font-mono text-white/20">#{k.iteration}</span>
                  </div>
                  <h4 className="text-xs font-black text-white mb-2 uppercase italic">{k.title}</h4>
                  <p className="text-[11px] leading-relaxed text-white/50">{k.description}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 3D RENDERER */}
      <div className="absolute inset-0 w-full h-full z-0">
        <Suspense fallback={
          <div className="w-full h-full flex items-center justify-center bg-slate-950 text-white">
            <div className="text-center">
              <div className="mb-4 text-2xl">⚙️ Loading 3D Engine...</div>
              <div className="text-sm opacity-50">Initializing graphics renderer</div>
            </div>
          </div>
        }>
          <SimulationCanvas objects={state.objects} avatarPos={avatarPos} avatarTarget={null} activePlan={state.activePlan} />
        </Suspense>
      </div>

      {showLegend && (
        <div className="absolute top-8 left-8 z-40 w-[300px] p-4 bg-black/65 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-2xl text-[10px] text-white">
          <div className="font-black uppercase tracking-[0.3em] text-white/70 mb-3">Metric Coordinate Legend</div>
          <div className="space-y-1 text-[9px] text-slate-300">
            <div><span className="font-semibold text-white">0-1 m:</span> display in cm</div>
            <div><span className="font-semibold text-white">1-999 m:</span> display in m + cm</div>
            <div><span className="font-semibold text-white">≥ 1 km:</span> display in km + m</div>
          </div>
          <div className="mt-4 p-3 bg-white/5 rounded-2xl border border-white/10">
            <div className="text-[8px] uppercase tracking-[0.3em] text-slate-400 mb-1">Avatar Position</div>
            <div className="font-mono text-[10px] text-white">{formatPositionWithUnits(avatarPos)}</div>
          </div>
          {state.activePlan && (
            <div className="mt-3 p-3 bg-white/5 rounded-2xl border border-white/10">
              <div className="text-[8px] uppercase tracking-[0.3em] text-slate-400 mb-1">Next Plan Step</div>
              <div className="font-bold text-[10px] text-white">{state.activePlan.steps[state.activePlan.currentStepIndex]?.label || 'Awaiting step'}</div>
              <div className="mt-1 font-mono text-[9px] text-slate-300">{formatPositionWithUnits(state.activePlan.steps[state.activePlan.currentStepIndex]?.position || [0, 0, 0])}</div>
            </div>
          )}
        </div>
      )}

      {/* DEBUG LOGGER PANEL */}
      <button 
        onClick={() => {
          const logs = logger.getLogs();
          console.log('📋 Recent logs:', logs);
          alert(`Logs exported to console. Total: ${logs.length}\n\nTip: Type 'world26Logger.exportLogs()' in console to get JSON.`);
        }}
        className="fixed bottom-24 right-8 z-50 px-4 py-2 bg-purple-600/80 hover:bg-purple-500 backdrop-blur-sm border border-purple-400/50 rounded-2xl text-xs font-bold text-white transition-all duration-300 shadow-lg hover:shadow-purple-500/50"
        title="Export debug logs"
      >
        🔍 Debug Logs
      </button>

      {/* FOOTER */}
      <div className="absolute bottom-8 right-8 z-10 flex gap-4">
        <div className="bg-black/60 backdrop-blur-2xl p-2 rounded-2xl border border-white/10 flex">
          <button onClick={() => setIsAuto(true)} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isAuto ? 'bg-sky-500 text-white shadow-xl shadow-sky-500/20' : 'text-white/30'}`}>Auto-Pilot</button>
          <button onClick={() => setIsAuto(false)} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!isAuto ? 'bg-white text-slate-950 shadow-xl shadow-white/10' : 'text-white/30'}`}>Manual</button>
        </div>
        <button onClick={runSimulationStep} disabled={isProcessing} className="px-12 h-16 bg-white hover:bg-sky-50 text-slate-950 rounded-[20px] font-black uppercase italic tracking-tighter transition-all shadow-2xl disabled:opacity-50 active:scale-95">Initiate Synthesis</button>
      </div>

      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_transparent_50%,_rgba(2,6,23,0.9)_100%)] opacity-80" />
    </div>
  );
}

export default App;
