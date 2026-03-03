import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./GuidedTour.module.css";

const ONBOARDED_KEY = "pb:onboarded";
const TOUR_START_DELAY_MS = 500;

type TourStep = {
  selector: string;
  message: string;
  placement: "right" | "bottom" | "left" | "top";
};

const TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="palette"]',
    message: "This is the Palette — drag blocks from here onto the canvas.",
    placement: "right",
  },
  {
    selector: '[data-tour="canvas"]',
    message: "Click any block on the canvas to select it.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="inspector"]',
    message: "Use the Inspector to change content and styles.",
    placement: "left",
  },
  {
    selector: '[data-tour="preview-toggle"]',
    message: "Switch to Preview mode to see your page as visitors will.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="save-status"]',
    message: "Your work is auto-saved — and you can export anytime.",
    placement: "bottom",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

function getTargetRect(selector: string): Rect | null {
  try {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  } catch {
    return null;
  }
}

const PADDING = 8;
const TOOLTIP_WIDTH = 280;

function computeTooltipPosition(
  target: Rect,
  placement: TourStep["placement"],
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = 0;
  let left = 0;

  switch (placement) {
    case "right":
      top = target.top + target.height / 2 - 60;
      left = target.left + target.width + PADDING;
      break;
    case "left":
      top = target.top + target.height / 2 - 60;
      left = target.left - TOOLTIP_WIDTH - PADDING;
      break;
    case "bottom":
      top = target.top + target.height + PADDING;
      left = target.left + target.width / 2 - TOOLTIP_WIDTH / 2;
      break;
    case "top":
      top = target.top - 130 - PADDING;
      left = target.left + target.width / 2 - TOOLTIP_WIDTH / 2;
      break;
  }

  // Clamp to viewport
  left = Math.max(PADDING, Math.min(left, vw - TOOLTIP_WIDTH - PADDING));
  top = Math.max(PADDING, Math.min(top, vh - 140 - PADDING));

  return { top, left };
}

export function GuidedTour(props: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentStep = TOUR_STEPS[step];
  const totalSteps = TOUR_STEPS.length;

  const computePositions = useCallback(() => {
    if (!currentStep) return;
    const rect = getTargetRect(currentStep.selector);
    if (!rect) return;
    setTargetRect(rect);
    setTooltipPos(computeTooltipPosition(rect, currentStep.placement));
  }, [currentStep]);

  // Initial delay + first compute
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      computePositions();
      setVisible(true);
    }, TOUR_START_DELAY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [computePositions]);

  // Recompute when step changes
  useLayoutEffect(() => {
    if (!visible) return;
    computePositions();
  }, [step, visible, computePositions]);

  // Recompute on resize
  useEffect(() => {
    if (!visible) return;
    const handler = () => computePositions();
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, [visible, computePositions]);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(ONBOARDED_KEY, "true");
    } catch {
      // ignore quota errors
    }
    props.onDone();
  }, [props]);

  const handleNext = useCallback(() => {
    if (step < totalSteps - 1) {
      setStep((s) => s + 1);
    } else {
      finish();
    }
  }, [step, totalSteps, finish]);

  const handleSkip = useCallback(() => {
    finish();
  }, [finish]);

  if (!visible || !currentStep || !targetRect || !tooltipPos) return null;

  return (
    <>
      {/* Spotlight overlay using box-shadow trick */}
      <div
        className={styles.spotlight}
        aria-hidden="true"
        style={{
          top: targetRect.top - 4,
          left: targetRect.left - 4,
          width: targetRect.width + 8,
          height: targetRect.height + 8,
        }}
      />

      {/* Tooltip */}
      <div
        className={styles.tooltip}
        role="dialog"
        aria-label={`Tour step ${step + 1} of ${totalSteps}`}
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
      >
        <div className={styles.message}>{currentStep.message}</div>
        <div className={styles.controls}>
          <span className={styles.stepIndicator}>{step + 1} of {totalSteps}</span>
          <div className={styles.actions}>
            <button type="button" className={styles.skipLink} onClick={handleSkip}>
              Skip tour
            </button>
            <button type="button" className={styles.nextBtn} onClick={handleNext}>
              {step < totalSteps - 1 ? "Next" : "Done"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function shouldShowTour(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) !== "true";
  } catch {
    return false;
  }
}

export function markTourDone(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, "true");
  } catch {
    // ignore
  }
}
