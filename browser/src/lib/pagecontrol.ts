// What the browser can ask of the page in a tab, however it's shown: a .biggle page (PageFrame),
// a site straight from the internet (SiteView in the desktop app), or another website (WebFrame).
// Each says what it can do; buttons and commands that need something a page can't do say so.

export type ReaderText = { title: string; html: string };

export type PageControl = {
  print?(): Promise<void> | void;
  reader?(): Promise<ReaderText | null>;
  pip?(): Promise<boolean>;
  /** A picture of the page: small (`width`) for tab previews, or full size. */
  capture?(width?: number): Promise<string | null>;
  /** How much memory and processor it's using (the performance overlay). */
  metrics?(): Promise<{ cpu: number; memory: number } | null>;
};

const controls = new Map<number, PageControl>();

/** A tab's page says what it can do. Returns a function to call when the page goes. */
export function provideControl(tabId: number, control: PageControl): () => void {
  controls.set(tabId, control);
  return () => {
    if (controls.get(tabId) === control) controls.delete(tabId);
  };
}

export const controlFor = (tabId: number): PageControl | undefined => controls.get(tabId);
