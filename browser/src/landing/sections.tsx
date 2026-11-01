// The parts of the bnet website below the hero: live sites (Magic UI marquee and number ticker),
// what bnet does (Aceternity bento grid, Magic UI border beam), the download call to action and
// the footer (both adapted from Monet's sections).
import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Download, Gamepad2, Globe, MessagesSquare, Search, ShieldCheck, Trophy, Wand2 } from 'lucide-react';
import { SERVER } from '../lib/config';
import { i18n, t, type Lang } from '../lib/i18n.svelte';
import { BentoGrid, BentoGridItem } from './ui/bento-grid';
import { BorderBeam } from './ui/border-beam';
import { Marquee } from './ui/marquee';
import { NumberTicker } from './ui/number-ticker';

export const RELEASES = 'https://github.com/bigglenet/bigglenet/releases/latest';
export const OS = /Win/.test(navigator.platform) ? 'Windows' : /Linux/.test(navigator.platform) ? 'Linux' : 'Mac';

/** Text from t() with React parts in place of its {names}. */
export function fill(text: string, parts: Record<string, ReactNode>): ReactNode[] {
  return text.split(/(\{\w+\})/).map((piece, i) => {
    const name = /^\{(\w+)\}$/.exec(piece)?.[1];
    return name && name in parts ? <span key={i}>{parts[name]}</span> : piece;
  });
}

type Site = { name: string; tld: string; title: string | null };
const host = (s: Site) => (s.name.endsWith('.b') ? s.name : `${s.name}.biggle`);

function SiteCard({ site }: { site: Site }) {
  return (
    <figure className="flex w-64 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <img
        src={`${SERVER}/site/${encodeURIComponent(site.name)}/.button`}
        width={88}
        height={31}
        alt=""
        loading="lazy"
        className="shrink-0 rounded-[3px] [image-rendering:pixelated]"
      />
      <figcaption className="min-w-0 text-left">
        <p className="truncate text-sm font-medium text-cream">{host(site)}</p>
        {site.title && <p className="truncate text-xs text-white/45">{site.title}</p>}
      </figcaption>
    </figure>
  );
}

/** Every live site, scrolling by: real ones, with their 88×31 buttons. */
export function Sites() {
  const [sites, setSites] = useState<Site[]>([]);
  useEffect(() => {
    fetch(`${SERVER}/api/names`)
      .then((r) => (r.ok ? r.json() : { names: [] }))
      .then((d: { names?: Site[] }) => setSites(d.names ?? []))
      .catch(() => {});
  }, []);
  if (sites.length < 4) return null;
  const half = Math.ceil(sites.length / 2);
  return (
    <section className="relative py-20">
      <h2 className="mx-auto max-w-2xl px-6 text-center text-2xl font-semibold tracking-tight text-cream md:text-3xl">
        {fill(t('{n} sites, made by the people on bnet'), { n: <NumberTicker value={sites.length} className="text-sunset" /> })}
      </h2>
      <div className="relative mt-10 flex flex-col gap-4 overflow-hidden">
        <Marquee pauseOnHover className="[--duration:60s]">
          {sites.slice(0, half).map((s) => (
            <SiteCard key={s.name} site={s} />
          ))}
        </Marquee>
        <Marquee reverse pauseOnHover className="[--duration:60s]">
          {sites.slice(half).map((s) => (
            <SiteCard key={s.name} site={s} />
          ))}
        </Marquee>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1/6 bg-gradient-to-r from-ink" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/6 bg-gradient-to-l from-ink" />
      </div>
    </section>
  );
}

/** The picture at the top of a bento card. */
function Visual({ children, tint }: { children: ReactNode; tint: string }) {
  return (
    <div className="relative flex min-h-[7rem] flex-1 items-center justify-center overflow-hidden rounded-lg border border-white/10" style={{ background: `radial-gradient(120% 120% at 0% 0%, ${tint}33, transparent 60%), #1b1b1b` }}>
      {children}
    </div>
  );
}

function MiniSite() {
  return (
    <div className="w-[78%] rounded-md border border-white/15 bg-ink shadow-2xl">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-2.5 py-1.5">
        <span className="h-2 w-2 rounded-full bg-white/20" />
        <span className="h-2 w-2 rounded-full bg-white/20" />
        <span className="ml-2 rounded bg-white/5 px-2 py-0.5 text-[10px] text-white/60">{t('yourname.biggle')}</span>
      </div>
      <div className="space-y-1.5 p-3">
        <div className="h-3 w-1/2 rounded bg-sunset/80" />
        <div className="h-2 w-5/6 rounded bg-white/15" />
        <div className="h-2 w-2/3 rounded bg-white/10" />
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <div className="h-8 rounded bg-white/10" />
          <div className="h-8 rounded bg-white/10" />
          <div className="h-8 rounded bg-white/10" />
        </div>
      </div>
    </div>
  );
}

const icon = 'h-5 w-5 text-sunset';

/** What bnet does. */
export function Features() {
  const items = [
    {
      title: t('Make your own site'),
      description: t('Pick a name and a look, then add blocks. No code needed, or write your own.'),
      icon: <Wand2 className={icon} />,
      header: (
        <Visual tint="#ff7a59">
          <MiniSite />
        </Visual>
      ),
      className: 'md:col-span-2',
    },
    {
      title: t('Friends, chat and calls'),
      description: t('Message your friends, call them, and see what they’re up to.'),
      icon: <MessagesSquare className={icon} />,
      header: (
        <Visual tint="#3b82f6">
          <div className="flex flex-col gap-2 text-xs">
            <span className="self-start rounded-2xl bg-white/10 px-3 py-1.5 text-white/80">{t('wanna play chess?')}</span>
            <span className="self-end rounded-2xl bg-sunset px-3 py-1.5 text-ink">{t('on my way 🏃')}</span>
          </div>
        </Visual>
      ),
    },
    {
      title: t('Games together'),
      description: t('Tic-tac-toe, chess and draw & guess, started from any chat.'),
      icon: <Gamepad2 className={icon} />,
      header: (
        <Visual tint="#2f9e6b">
          <div className="grid grid-cols-3 gap-1 text-2xl font-semibold leading-none">
            {['✕', '○', '', '', '✕', '○', '○', '', '✕'].map((mark, i) => (
              <span key={i} className={`grid h-10 w-10 place-items-center rounded-md bg-white/5 ${mark === '✕' ? 'text-sunset' : 'text-cream'}`}>
                {mark}
              </span>
            ))}
          </div>
        </Visual>
      ),
    },
    {
      title: t('Find anything with Nox'),
      description: t('Search every .biggle site, or let it take you somewhere random.'),
      icon: <Search className={icon} />,
      header: (
        <Visual tint="#8b6cf0">
          <div className="flex w-[80%] items-center gap-2 rounded-full border border-white/15 bg-ink px-3 py-2 text-xs text-white/50">
            <Search className="h-3.5 w-3.5" /> {t('games, art, homework help…')}
          </div>
        </Visual>
      ),
    },
    {
      title: t('No ads, no trackers'),
      description: t('Sites can only load things from bnet, so nothing follows you around.'),
      icon: <ShieldCheck className={icon} />,
      header: (
        <Visual tint="#e64998">
          <span className="text-5xl font-semibold tracking-tight text-cream">0</span>
          <span className="ml-2 text-xs text-white/50">{t('ads and trackers')}</span>
        </Visual>
      ),
      beam: true,
    },
    {
      title: t('Badges, stamps and the weekly challenge'),
      description: t('Collect stamps from sites you like, earn badges, and enter a new theme every week.'),
      icon: <Trophy className={icon} />,
      header: (
        <Visual tint="#ffc93c">
          <div className="flex gap-3 text-4xl">
            <span>🏠</span>
            <span>🔥</span>
            <span>📮</span>
            <span>🏆</span>
          </div>
        </Visual>
      ),
      className: 'md:col-span-3',
    },
  ];
  return (
    <section className="px-6 py-20">
      <motion.h2
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-2xl text-center text-3xl font-semibold tracking-tight text-cream md:text-5xl"
      >
        {t('Everything you need, nothing you don’t')}
      </motion.h2>
      <BentoGrid className="mt-14 max-w-5xl md:auto-rows-[19rem]">
        {items.map((item) => (
          <div key={item.title} className={`relative ${item.className ?? ''}`}>
            <BentoGridItem title={item.title} description={item.description} header={item.header} icon={item.icon} className="h-full !bg-ink-2" />
            {item.beam && <BorderBeam size={120} duration={8} colorFrom="#ff7a59" colorTo="#f6f4f0" />}
          </div>
        ))}
      </BentoGrid>
    </section>
  );
}

/** Adapted from Monet's cursor-com-cta-8. */
export function Cta({ phone }: { phone: boolean }) {
  return (
    <section className="w-full px-6 py-24 lg:py-32">
      <div className="mx-auto max-w-7xl text-center">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-8 text-4xl font-medium tracking-tight text-cream md:text-5xl lg:text-6xl"
        >
          {t('Try bnet now.')}
        </motion.h2>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex flex-wrap justify-center gap-3"
        >
          {phone ? (
            <motion.a
              href="#get"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-2 rounded-full bg-cream px-6 py-3 text-base font-medium text-ink"
            >
              {t('Add bnet to your home screen')}
            </motion.a>
          ) : (
            (['Mac', 'Windows', 'Linux'] as const).map((os) => (
              <motion.a
                key={os}
                href={RELEASES}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-base font-medium ${os === OS ? 'bg-cream text-ink' : 'border border-white/15 text-cream'}`}
              >
                {t('Download for {os}', { os })}
                <Download className="h-5 w-5" />
              </motion.a>
            ))
          )}
        </motion.div>
      </div>
    </section>
  );
}

/** Adapted from Monet's cursor-com-footer-9. */
export function Footer({ onLanguage }: { onLanguage: (lang: Lang) => void }) {
  const links: Record<string, { label: string; href: string }[]> = {
    [t('Get bnet')]: [
      { label: t('Download for {os}', { os: 'Mac' }), href: RELEASES },
      { label: t('Download for {os}', { os: 'Windows' }), href: RELEASES },
      { label: t('Download for {os}', { os: 'Linux' }), href: RELEASES },
    ],
    [t('Open in bnet')]: [
      { label: 'home.biggle', href: 'biggle://home.biggle/' },
      { label: 'games.biggle', href: 'biggle://games.biggle/' },
      { label: 'Nox', href: 'biggle://nox' },
    ],
  };
  return (
    <footer className="w-full border-t border-white/10 bg-ink-2 px-6 py-12 lg:px-12 lg:py-16">
      <div className="mx-auto max-w-7xl">
        <nav className="mb-12 grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2">
            <span className="block h-10 w-12 bg-cream [mask:url(/wordmark.png)_left/contain_no-repeat] [-webkit-mask:url(/wordmark.png)_left/contain_no-repeat]" aria-label="bnet" role="img" />
            <p className="mt-4 max-w-xs text-sm text-white/50">{t('The internet, but smaller and nicer')}</p>
          </div>
          {Object.entries(links).map(([title, list]) => (
            <div key={title}>
              <h3 className="mb-4 text-sm font-medium text-white/50">{title}</h3>
              <ul className="space-y-2">
                {list.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-sm text-cream transition-opacity hover:opacity-80">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="flex flex-col items-start justify-between gap-4 text-sm text-white/50 md:flex-row md:items-center">
          <span>&copy; 2026 bnet</span>
          <label className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-2 text-cream">
            <Globe className="h-4 w-4" />
            <select
              value={i18n.lang}
              onChange={(e) => onLanguage(e.target.value as Lang)}
              className="bg-transparent outline-none"
              aria-label={t('Language')}
            >
              <option value="en" className="bg-ink">
                English
              </option>
              <option value="tr" className="bg-ink">
                Türkçe
              </option>
            </select>
          </label>
        </div>
      </div>
    </footer>
  );
}
