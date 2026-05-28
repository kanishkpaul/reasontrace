import React from "react";
import { useTraceStore } from "../store";
import { 
  Play, 
  Pause, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw, 
  ChevronsRight,
  Gauge
} from "lucide-react";

export const TimelineControls: React.FC = () => {
  const {
    currentTrace,
    currentStep,
    maxStep,
    isPlaying,
    playbackSpeed,
    setCurrentStep,
    stepForward,
    stepBackward,
    togglePlay,
    resetReplay,
    revealAll,
    setPlaybackSpeed
  } = useTraceStore();

  if (!currentTrace || currentTrace.events.length === 0) return null;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentStep(Number(e.target.value));
  };

  const speedOptions = [
    { label: "0.5s", value: 500 },
    { label: "1.0s", value: 1000 },
    { label: "1.5s", value: 1500 },
    { label: "3.0s", value: 3000 }
  ];

  return (
    <div className="bg-cyber-card border border-cyber-border rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-cyber-glow">
      {/* Playback Button Group */}
      <div className="flex items-center space-x-1.5 shrink-0">
        {/* Reset */}
        <button
          onClick={resetReplay}
          disabled={currentStep <= 1}
          className="p-2 rounded bg-cyber-bg border border-cyber-border hover:bg-cyber-hover text-cyber-muted hover:text-cyber-text disabled:opacity-40 transition-colors"
          title="Reset to Step 1"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {/* Step Backward */}
        <button
          onClick={stepBackward}
          disabled={currentStep <= 1}
          className="p-2 rounded bg-cyber-bg border border-cyber-border hover:bg-cyber-hover text-cyber-muted hover:text-cyber-text disabled:opacity-40 transition-colors"
          title="Step Backward"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          className={`p-2.5 rounded-lg border flex items-center justify-center transition-all duration-200
            ${isPlaying 
              ? "bg-amber-600 hover:bg-amber-500 border-amber-600 text-white shadow-amber-glow" 
              : "bg-cyber-primary hover:bg-blue-600 border-cyber-primary text-white shadow-cyber-glow"
            }`}
          title={isPlaying ? "Pause Autoplay" : "Play Autoplay"}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
        </button>

        {/* Step Forward */}
        <button
          onClick={stepForward}
          disabled={currentStep >= maxStep}
          className="p-2 rounded bg-cyber-bg border border-cyber-border hover:bg-cyber-hover text-cyber-muted hover:text-cyber-text disabled:opacity-40 transition-colors"
          title="Step Forward"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        {/* Reveal All */}
        <button
          onClick={revealAll}
          disabled={currentStep >= maxStep}
          className="p-2 rounded bg-cyber-bg border border-cyber-border hover:bg-cyber-hover text-cyber-muted hover:text-cyber-text disabled:opacity-40 transition-colors"
          title="Skip to End"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Scrubber Timeline Slider */}
      <div className="flex-1 w-full flex items-center space-x-4">
        {/* Step Label */}
        <div className="flex flex-col text-left font-mono shrink-0">
          <span className="text-[10px] text-cyber-muted uppercase">Timeline</span>
          <span className="text-sm font-bold text-cyber-text">
            Step {currentStep} <span className="text-cyber-muted text-xs">/ {maxStep}</span>
          </span>
        </div>

        {/* Scrubber Slider */}
        <div className="flex-1 relative flex items-center">
          <input
            type="range"
            min="1"
            max={maxStep}
            value={currentStep}
            onChange={handleSliderChange}
            className="w-full h-1 bg-cyber-border rounded-lg appearance-none cursor-pointer focus:outline-none accent-cyber-primary"
            style={{
              background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${((currentStep - 1) / (maxStep - 1)) * 100}%, #1F293D ${((currentStep - 1) / (maxStep - 1)) * 100}%, #1F293D 100%)`
            }}
          />

          {/* Stepped dot marks on timeline */}
          <div className="absolute inset-x-0 -top-1 flex justify-between pointer-events-none px-1">
            {Array.from({ length: maxStep }).map((_, i) => (
              <div 
                key={i} 
                className={`w-1.5 h-1.5 rounded-full border transition-all ${
                  i + 1 <= currentStep 
                    ? "bg-cyber-primary border-cyber-primary" 
                    : "bg-cyber-bg border-cyber-border"
                }`}
                title={`Step ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Playback Speed Setting */}
      <div className="flex items-center space-x-2 shrink-0 bg-cyber-bg border border-cyber-border px-3 py-1.5 rounded-lg text-xs">
        <Gauge className="w-3.5 h-3.5 text-cyber-muted" />
        <span className="text-cyber-muted">Speed:</span>
        <div className="flex space-x-1">
          {speedOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setPlaybackSpeed(opt.value)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all
                ${playbackSpeed === opt.value 
                  ? "bg-cyber-primary text-white" 
                  : "text-cyber-muted hover:text-cyber-text"
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
