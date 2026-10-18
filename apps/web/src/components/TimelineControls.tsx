import type { CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import { FirstStepIcon, LastStepIcon, PauseIcon, PlayIcon, StepBackIcon, StepForwardIcon } from "../lib/icons";
import { useTraceStore } from "../store";

const SPEEDS = [
  { label: "0.5s", value: 500 },
  { label: "1s", value: 1000 },
  { label: "1.5s", value: 1500 },
  { label: "3s", value: 3000 },
];

/** Replay through the trace's steps. Counts positions, not raw step values, which may be timestamps (T2). */
export function TimelineControls() {
  const s = useTraceStore(useShallow((state) => ({
    trace: state.currentTrace,
    currentStep: state.currentStep,
    steps: state.steps,
    isPlaying: state.isPlaying,
    playbackSpeed: state.playbackSpeed,
    setCurrentStep: state.setCurrentStep,
    stepForward: state.stepForward,
    stepBackward: state.stepBackward,
    togglePlay: state.togglePlay,
    resetReplay: state.resetReplay,
    revealAll: state.revealAll,
    setPlaybackSpeed: state.setPlaybackSpeed,
  })));

  if (!s.trace || s.trace.events.length === 0) return null;

  const position = Math.max(0, s.steps.indexOf(s.currentStep));
  const last = s.steps.length - 1;
  const filled = last === 0 ? 100 : (position / last) * 100;

  return (
    <div className="timeline">
      <div className="timeline__buttons">
        <button type="button" className="btn btn--ghost btn--icon" aria-label="First step" onClick={s.resetReplay} disabled={position === 0}>
          <FirstStepIcon />
        </button>
        <button type="button" className="btn btn--ghost btn--icon" aria-label="Step Backward" onClick={s.stepBackward} disabled={position === 0}>
          <StepBackIcon />
        </button>
        <button type="button" className="btn btn--secondary btn--icon" aria-label={s.isPlaying ? "Pause replay" : "Play replay"} onClick={s.togglePlay}>
          {s.isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button type="button" className="btn btn--ghost btn--icon" aria-label="Step Forward" onClick={s.stepForward} disabled={position === last}>
          <StepForwardIcon />
        </button>
        <button type="button" className="btn btn--ghost btn--icon" aria-label="Last step" onClick={s.revealAll} disabled={position === last}>
          <LastStepIcon />
        </button>
      </div>
      <span className="timeline__position">
        step {position + 1} / {s.steps.length}
      </span>
      <input
        type="range"
        className="timeline__slider"
        aria-label="Replay position"
        min={0}
        max={last}
        value={position}
        onChange={(e) => s.setCurrentStep(s.steps[Number(e.target.value)])}
        style={{ "--fill": `${filled}%` } as CSSProperties}
      />
      <div className="seg" role="group" aria-label="Replay speed">
        {SPEEDS.map((speed) => (
          <button key={speed.value} type="button" aria-pressed={s.playbackSpeed === speed.value} onClick={() => s.setPlaybackSpeed(speed.value)}>
            {speed.label}
          </button>
        ))}
      </div>
    </div>
  );
}
