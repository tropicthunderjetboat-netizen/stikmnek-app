import React, { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';

const SM_MIN = '(min-width: 640px)';

/** Step index used by this stepper (1-based, matches product copy). */
export type OnboardingStepNumber = 1 | 2 | 3;

export interface OnboardingStepsProps {
  currentStep: OnboardingStepNumber;
  /** 1-based step numbers that are already done (e.g. `[1]` after signup, `[1, 2]` once a `businesses` row exists). */
  completedSteps: number[];
  variant?: 'default' | 'compact';
  /** UI copy; defaults to English. */
  language?: 'en' | 'fr' | 'bi';
  className?: string;
}

type Lang = 'en' | 'fr' | 'bi';

const NAV_LABEL: Record<Lang, string> = {
  en: 'Business onboarding progress',
  fr: 'Progression de l’inscription entreprise',
  bi: 'Business onboarding',
};

const STEP_ARIA_COMPLETED: Record<Lang, string> = {
  en: 'completed',
  fr: 'terminée',
  bi: 'finis',
};

const STEP_ARIA_CURRENT: Record<Lang, string> = {
  en: 'current step',
  fr: 'étape en cours',
  bi: 'step we i stap long hem',
};

const STEP_ARIA_UPCOMING: Record<Lang, string> = {
  en: 'not started',
  fr: 'non commencée',
  bi: 'nogat yet',
};

const STEPS: ReadonlyArray<{
  id: OnboardingStepNumber;
  title: Record<Lang, string>;
  description: Record<Lang, string>;
}> = [
  {
    id: 1,
    title: {
      en: 'Create account',
      fr: 'Créer un compte',
      bi: 'Mekem akaon',
    },
    description: {
      en: 'Sign up as a business partner',
      fr: 'Inscription en tant que partenaire',
      bi: 'Saenap olsem business partner',
    },
  },
  {
    id: 2,
    title: {
      en: 'Business profile',
      fr: 'Profil entreprise',
      bi: 'Business profil',
    },
    description: {
      en: 'Save your business details and contact information',
      fr: 'Enregistrez les coordonnées de votre entreprise',
      bi: 'Sevem ol deta mo kontak blong bisnis',
    },
  },
  {
    id: 3,
    title: {
      en: 'First listing',
      fr: 'Première annonce',
      bi: 'Fes listing',
    },
    description: {
      en: 'Submit a deal; complete when an offering is approved',
      fr: 'Soumettez une offre ; terminé lorsqu’une annonce est approuvée',
      bi: 'Soema wan deal — finis taem wan offering i approve',
    },
  },
];

function normalizeCompletedSteps(raw: number[]): Set<OnboardingStepNumber> {
  const set = new Set<OnboardingStepNumber>();
  for (const n of raw) {
    if (n === 1 || n === 2 || n === 3) set.add(n);
  }
  return set;
}

function stepState(
  stepId: OnboardingStepNumber,
  currentStep: OnboardingStepNumber,
  completed: Set<OnboardingStepNumber>,
): 'complete' | 'current' | 'upcoming' {
  if (completed.has(stepId)) return 'complete';
  if (stepId === currentStep) return 'current';
  return 'upcoming';
}

function StepCircle({
  stepId,
  state,
  isCompact,
}: {
  stepId: OnboardingStepNumber;
  state: 'complete' | 'current' | 'upcoming';
  isCompact: boolean;
}) {
  const circleSize = isCompact ? 'h-8 w-8 min-h-8 min-w-8 text-xs' : 'h-10 w-10 min-h-10 min-w-10 text-sm';
  const circleStyles =
    state === 'complete'
      ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-200/80'
      : state === 'current'
        ? 'border-teal-600 bg-white text-teal-700 ring-2 ring-teal-500/40 ring-offset-2 ring-offset-white'
        : 'border-gray-200 bg-gray-50 text-gray-400';

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-2 font-bold transition-all duration-200 ${circleSize} ${circleStyles}`}
      aria-hidden={state === 'complete'}
    >
      {state === 'complete' ? (
        <Check className={isCompact ? 'h-4 w-4' : 'h-5 w-5'} strokeWidth={2.5} aria-hidden />
      ) : (
        <span aria-hidden>{stepId}</span>
      )}
    </span>
  );
}

/**
 * Reusable 3-step indicator for business onboarding (account → profile row → approved listing).
 * Parent supplies `currentStep` and `completedSteps` from app state (`user`, `businessOwnerHasBusinessRow`, offerings, etc.).
 */
const OnboardingSteps: React.FC<OnboardingStepsProps> = ({
  currentStep,
  completedSteps,
  variant = 'default',
  language = 'en',
  className = '',
}) => {
  const lang: Lang = language === 'fr' || language === 'bi' ? language : 'en';
  const completed = useMemo(() => normalizeCompletedSteps(completedSteps), [completedSteps]);

  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(SM_MIN);
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const isCompact = variant === 'compact';
  const titleClass = isCompact ? 'text-sm font-semibold' : 'text-base font-bold';
  const descClass = isCompact ? 'text-[11px] text-gray-500' : 'text-xs text-gray-500';
  const blockGap = isCompact ? 'gap-2' : 'gap-3';

  return (
    <nav aria-label={NAV_LABEL[lang]} className={className}>
      {/* Two layouts share logic; only one list is exposed to AT (see `aria-hidden`). */}
      <ol
        className={`flex flex-col ${blockGap} sm:hidden`}
        aria-hidden={isDesktop ? true : undefined}
      >
        {STEPS.map((step, index) => {
          const state = stepState(step.id, currentStep, completed);
          const isLast = index === STEPS.length - 1;
          const title = step.title[lang];
          const description = step.description[lang];
          const statusWord =
            state === 'complete'
              ? STEP_ARIA_COMPLETED[lang]
              : state === 'current'
                ? STEP_ARIA_CURRENT[lang]
                : STEP_ARIA_UPCOMING[lang];

          const spineComplete = !isLast && completed.has(step.id);

          return (
            <li
              key={step.id}
              className="relative flex gap-3"
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <div className="flex flex-col items-center">
                <StepCircle stepId={step.id} state={state} isCompact={isCompact} />
                {!isLast && (
                  <div
                    className={`mt-1 w-0.5 flex-1 min-h-[1.25rem] rounded-full transition-colors duration-200 ${
                      spineComplete ? 'bg-emerald-400' : 'bg-gray-200'
                    }`}
                    aria-hidden
                  />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <p className={`text-gray-900 ${titleClass}`}>{title}</p>
                <p className={`mt-0.5 leading-snug ${descClass}`}>{description}</p>
                <span className="sr-only">
                  {title}. {description}. {statusWord}.
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <ol
        className={`hidden sm:flex sm:w-full sm:items-start ${isCompact ? 'gap-1' : 'gap-2'}`}
        aria-hidden={isDesktop ? undefined : true}
      >
        {STEPS.map((step, index) => {
          const state = stepState(step.id, currentStep, completed);
          const isLast = index === STEPS.length - 1;
          const title = step.title[lang];
          const description = step.description[lang];
          const statusWord =
            state === 'complete'
              ? STEP_ARIA_COMPLETED[lang]
              : state === 'current'
                ? STEP_ARIA_CURRENT[lang]
                : STEP_ARIA_UPCOMING[lang];

          const lineAfterComplete = !isLast && completed.has(step.id);

          return (
            <li
              key={step.id}
              className="flex min-w-0 flex-1 items-start"
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <div className="flex min-w-0 flex-1 flex-col items-center px-1 text-center">
                <StepCircle stepId={step.id} state={state} isCompact={isCompact} />
                <p className={`mt-2 text-gray-900 ${titleClass}`}>{title}</p>
                <p className={`mt-1 max-w-[11rem] leading-snug ${descClass}`}>{description}</p>
                <span className="sr-only">
                  {title}. {description}. {statusWord}.
                </span>
              </div>
              {!isLast && (
                <div
                  className={`mx-0.5 h-0.5 min-w-[1.25rem] flex-1 rounded-full transition-colors duration-200 ${
                    isCompact ? 'mt-4' : 'mt-5'
                  } ${lineAfterComplete ? 'bg-emerald-400' : 'bg-gray-200'}`}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default OnboardingSteps;
