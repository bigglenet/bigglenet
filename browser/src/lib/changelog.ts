// What's new in each version of Bigglenet, newest first. Shown in Settings ("What's new"). Add the
// next version's entry here before releasing it.

export type Release = { version: string; date: string; changes: string[] };

export const CHANGELOG: Release[] = [
  {
    version: '1.1.1',
    date: '2026-10-17',
    changes: ['Chat messages keep a readable width in the narrow chat sidebar.'],
  },
  {
    version: '1.1.0',
    date: '2026-10-17',
    changes: [
      'Remix any site from its ⋯ menu: you get your own copy to change. You choose whether people may remix yours.',
      'Every site has an 88×31 button, like on the old web. Collect stamps from sites you like; they show on your profile.',
      'New blocks in the easy editor: photo gallery, countdown, music player, place, quiz and 88×31 buttons.',
      'The weekly challenge: a new theme each week, enter one of your sites and vote for your favourite. The winner is the site of the day.',
      'Badges on your profile for what you do on the Bigglenet.',
      'Games to play together on games.biggle: tic-tac-toe, chess, and draw & guess. Start one from any chat.',
      'The easy editor’s preview doesn’t stay blank any more.',
    ],
  },
  {
    version: '1.0.2',
    date: '2026-10-17',
    changes: ['English is the language unless you pick another in Settings → Language.'],
  },
  {
    version: '1.0.1',
    date: '2026-10-17',
    changes: ['The desktop app can update itself again: “Digest method not supported” is gone.'],
  },
  {
    version: '1.0.0',
    date: '2026-10-17',
    changes: [
      'Bigglenet in Turkish: pick it in Settings → Language, or it follows your computer.',
      'Make as many sites as you like.',
      'Chat: replies, reactions, editing and deleting, photos, files and voice messages, time capsules, link previews, sharing your screen, and watching or listening together in a call.',
      'Tabs: groups, pinning, muting, sleeping tabs, side by side, more than one window, reopening closed tabs, and picture-in-picture.',
      'Reader mode, dark mode for any site, screenshots, saving sites for offline, a command palette (⌘K), downloads, and getting around with a game controller.',
      'Sites: drafts you publish when ready, editors who can change your site with you at the same time, stats, link previews, comments, polls, likes, leaderboards, achievements, drawing walls and rooms for live pages.',
      'Profiles, statuses, a notification centre and blocking people.',
      'The feed, invite links, clubs with their own chat and site, the board (forums), events with reminders, and collections of sites.',
      'Nox: rankings, tags, search inside pages, following sites, webrings, the site of the day and this week on the Bigglenet.',
      'Your bookmarks and settings on every device, two-factor sign-in, passkeys, downloading your data and deleting your account.',
      'Notifications even when Bigglenet is closed, and the desktop app can keep running in the background.',
      'Reporting things that shouldn’t be on the Bigglenet, announcements, biggle://status, and smaller, faster updates for the desktop app.',
      'Easier to use with a keyboard and screen readers, and less movement if your computer asks for it.',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-10-12',
    changes: [
      'Bookmarks: ⌘D (Ctrl+D) or the star in the address bar, a bookmarks bar, and biggle://bookmarks to sort them.',
      'History at biggle://history (⌘Y on a Mac, Ctrl+H elsewhere), and ⇧⌘T (Ctrl+Shift+T) brings back a tab you closed.',
      'Find in page with ⌘F (Ctrl+F), on every page, including sites straight from the internet.',
      'Zoom with ⌘+ and ⌘− (Ctrl on Windows and Linux), remembered for each site. ⌘0 goes back to 100%.',
      'Notifications for new messages and calls while you’re using another app, and the unread count on Bigglenet’s icon.',
      'Site owners see how many visits their sites get, in My sites.',
      'New blocks in the site editor: Total visits, and a Guestbook visitors can sign. Code sites can use <biggle-visits> and <biggle-guestbook>.',
    ],
  },
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
