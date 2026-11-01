// The bnet website, for anyone opening bnet.ethembeldagli.dev in a normal browser. bnet itself
// runs in the desktop app, or as an app on a phone's home screen, so this page is about getting it:
// a download on computers, adding it to the home screen on phones. (The old get-the-app page's
// hidden ways in still work: tap "I have it" five times quickly, or the first phone step 20 times.)
import { useEffect, useReducer, useState } from 'react';
import { Download } from 'lucide-react';
import { unlockWeb, type Gate } from '../lib/gate';
import { i18n, t, type Lang } from '../lib/i18n.svelte';
import { Cta, Features, fill, Footer, OS, RELEASES, Sites } from './sections';
import BlurText from './ui/BlurText';
import { Particles } from './ui/particles';
import { ShimmerButton } from './ui/shimmer-button';
import ShinyText from './ui/ShinyText';
import { Spotlight } from './ui/spotlight-new';

type Phone = 'ios' | 'android';
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Android browsers can offer their own install prompt. */
function useInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    addEventListener('beforeinstallprompt', onPrompt);
    addEventListener('appinstalled', onInstalled);
    return () => {
      removeEventListener('beforeinstallprompt', onPrompt);
      removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    if ((await prompt.userChoice).outcome === 'accepted') setInstalled(true);
    setPrompt(null);
  };
  return { canInstall: !!prompt, installed, install };
}

// "I have it": taps in the last 3 seconds. The first step: taps each within 1.5 s of the last.
let opens: number[] = [];
const openTaps = () => {
  const now = Date.now();
  opens = [...opens.filter((at) => now - at < 3000), now];
  return opens.length;
};
let step = { count: 0, at: 0 };
const stepTaps = () => {
  const now = Date.now();
  step = { count: now - step.at < 1500 ? step.count + 1 : 1, at: now };
  return step.count;
};

function GetForComputer() {
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <ShimmerButton onClick={() => (location.href = RELEASES)} background="#f6f4f0" shimmerColor="#ff7a59" className="gap-2 px-7 py-3.5 text-base font-semibold !text-ink">
          <Download className="h-5 w-5" /> {t('Download for {os}', { os: OS })}
        </ShimmerButton>
        <a
          href="biggle://home.biggle/"
          onClick={(e) => {
            // More taps while it's opening are ignored (five unlock bnet here).
            const n = openTaps();
            if (n > 1) e.preventDefault();
            if (n >= 5) unlockWeb();
          }}
          className="rounded-full border border-white/15 px-6 py-3.5 text-base font-medium text-cream transition-colors hover:bg-white/5"
        >
          {t('I have it, open bnet')}
        </a>
      </div>
      <p className="max-w-md text-sm text-white/45">
        {t("On a computer, bnet only opens in the Biggle desktop app. It's free and tiny.")}{' '}
        {t('Also for {and}. On a phone? Open this page there and add it to your home screen.', {
          and: OS === 'Mac' ? t('Windows and Linux') : OS === 'Windows' ? t('Mac and Linux') : t('Mac and Windows'),
        })}
      </p>
    </div>
  );
}

function GetForPhone({ phone }: { phone: Phone }) {
  const { canInstall, installed, install } = useInstall();
  if (installed) {
    return <p className="text-lg text-cream">{fill(t('Open {app} from your home screen.'), { app: <strong>bnet</strong> })}</p>;
  }
  if (canInstall) {
    return (
      <ShimmerButton onClick={install} background="#f6f4f0" shimmerColor="#ff7a59" className="px-7 py-3.5 text-base font-semibold !text-ink">
        {t('Install bnet')}
      </ShimmerButton>
    );
  }
  const first = () => stepTaps() >= 20 && unlockWeb();
  const steps =
    phone === 'ios'
      ? [
          fill(t('Tap the {share} button {icon} in your browser.'), {
            share: <strong>{t('Share')}</strong>,
            icon: (
              <svg viewBox="0 0 24 24" className="inline h-4 w-4 fill-none stroke-current stroke-2" aria-hidden="true">
                <path d="M12 3v12M8 7l4-4 4 4M8 10H5v11h14V10h-3" />
              </svg>
            ),
          }),
          fill(t('Choose {item}.'), { item: <strong>{t('Add to Home Screen')}</strong> }),
        ]
      : [
          fill(t('Open your browser’s menu ({menu}).'), { menu: <strong>⋮</strong> }),
          fill(t('Choose {install} or {add}.'), { install: <strong>{t('Install app')}</strong>, add: <strong>{t('Add to Home screen')}</strong> }),
        ];
  steps.push(fill(t('Open {app} from your home screen.'), { app: <strong>bnet</strong> }));
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <p className="text-sm text-white/45">{t('On phones, bnet works as an app on your home screen, not in a browser tab.')}</p>
    <ol className="w-full space-y-2 text-left">
      {steps.map((step, i) => (
        <li key={i} onClick={i === 0 ? first : undefined} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-cream">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-cream text-sm font-semibold text-ink">{i + 1}</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
    </div>
  );
}

export default function Landing({ gate }: { gate: Exclude<Gate, 'ok'> }) {
  const phone = gate === 'desktop' ? null : gate;
  // Switching language re-draws the page in it.
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const setLanguage = async (lang: Lang) => {
    await i18n.set(lang);
    redraw();
  };

  return (
    <div className="dark min-h-screen bg-ink font-sans text-cream antialiased">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-ink/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <span className="block h-8 w-10 bg-cream [mask:url(/wordmark.png)_left/contain_no-repeat] [-webkit-mask:url(/wordmark.png)_left/contain_no-repeat]" aria-label="bnet" role="img" />
          <a href={phone ? '#get' : RELEASES} className="rounded-full bg-cream px-4 py-2 text-sm font-semibold text-ink transition-opacity hover:opacity-90">
            {phone ? t('Get the app') : t('Download')}
          </a>
        </div>
      </header>

      <main>
        <section id="get" className="relative isolate flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-6 pb-20 pt-32 text-center">
          <Particles className="absolute inset-0 -z-10" quantity={120} ease={70} color="#f6f4f0" refresh />
          <Spotlight />
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_40%,transparent,var(--color-ink))]" />

          <span className="mb-8 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-sm">
            <ShinyText text={t('No ads. No trackers. Just your friends.')} color="#a3a3a3" shineColor="#f6f4f0" speed={3} />
          </span>
          <div role="heading" aria-level={1}>
            <BlurText
              text={t('The internet, but smaller and nicer')}
              animateBy="words"
              delay={120}
              className="max-w-4xl justify-center text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl"
            />
          </div>
          <p className="mt-6 max-w-xl text-lg text-white/60">
            {t('Explore .biggle sites, chat and call with friends, play games together and build your own site. No code needed.')}
          </p>
          <div className="mt-10 flex w-full justify-center">{phone ? <GetForPhone phone={phone} /> : <GetForComputer />}</div>
        </section>

        <Sites />
        <Features />
        <Cta phone={!!phone} />
      </main>
      <Footer onLanguage={setLanguage} />
    </div>
  );
}
