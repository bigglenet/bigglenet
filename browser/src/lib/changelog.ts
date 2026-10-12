// What's new in each version of Bigglenet, newest first. Shown in Settings ("What's new"). Add the
// next version's entry here before releasing it.

export type Release = { version: string; date: string; changes: string[] };

export const CHANGELOG: Release[] = [
  {
    version: '0.4.2',
    date: '2026-10-12',
    changes: [
      'Check for updates whenever you like, in Settings (and in the Bigglenet menu on a Mac).',
      'Settings shows which version you have, and what changed in each one.',
      'After an update, a note says what you’re on now.',
      'The desktop app offers updates again: 0.4.0 and 0.4.1 never showed the update message.',
      'Deleting a site from Admin → All sites works (it asks first, right in the page).',
    ],
  },
  {
    version: '0.4.1',
    date: '2026-10-12',
    changes: ['Sites straight from the internet block ads and trackers, with uBlock Origin’s filter lists.'],
  },
  {
    version: '0.4.0',
    date: '2026-10-12',
    changes: [
      'The desktop app now runs on Chromium (Electron). Sites straight from the internet are real Chromium pages in their tabs, so games and WebAssembly ports run at full speed, including ones that only work in Chrome (like the GTA V port).',
      'Bigglenet’s shortcuts (⌘T, ⌘W, ⌘L…) work while a site has the keyboard.',
      'Your sign-in, settings and site data come with you from the older app.',
    ],
  },
  {
    version: '0.3.3',
    date: '2026-10-11',
    changes: ['Games that need cross-origin isolation run as their own page, in the tab, and can pop out into a window.'],
  },
  {
    version: '0.3.2',
    date: '2026-10-11',
    changes: ['Links can load a site straight from the internet instead of through the Bigglenet.'],
  },
  {
    version: '0.3.1',
    date: '2026-10-10',
    changes: ['.b addresses are their own: hello.b and hello.biggle can be different sites.'],
  },
  {
    version: '0.3.0',
    date: '2026-10-10',
    changes: [
      'chat.biggle: group chats, nicknames for friends, and voice and video calls. The chat button opens it in a sidebar.',
      'Short .b addresses, for admins and people they trust.',
      'biggle://newtab and biggle://settings, with a way back to the normal new tab page.',
      'Bigger app icons on Windows and Linux.',
    ],
  },
  {
    version: '0.2.1',
    date: '2026-10-10',
    changes: ['Feature requests: ask for things and vote for the ideas you want most.'],
  },
  {
    version: '0.2.0',
    date: '2026-10-10',
    changes: ['Nox lists every site on the Bigglenet.', 'Admins get a page with every site and what they can do to it.'],
  },
  {
    version: '0.1.13',
    date: '2026-10-10',
    changes: [
      'Customize the new tab page, or pick another page for new tabs.',
      'Closing the last tab closes the app.',
      'Lots of tabs scroll instead of pushing the window buttons off.',
    ],
  },
  {
    version: '0.1.9',
    date: '2026-10-08',
    changes: [
      'Tabs come back after a reload.',
      'Live apps: normal websites and games shown on the Bigglenet.',
      'On Windows and Linux the tabs sit in the title bar, like a native browser.',
    ],
  },
  {
    version: '0.1.4',
    date: '2026-10-08',
    changes: ['Import websites that already exist.', 'Confirm your email by sending us the code.'],
  },
  {
    version: '0.1.2',
    date: '2026-10-07',
    changes: ['The site editor, with approvals by admins.', 'Sign up with email or Google.', 'Nox, the Bigglenet’s search.'],
  },
  {
    version: '0.1.0',
    date: '2026-10-07',
    changes: ['The first Bigglenet: .biggle sites, the Biggle browser, friends and chat, home.biggle, and apps that update themselves.'],
  },
];
