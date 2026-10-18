// Your pet (server/src/pets.ts): it lives on the new tab page, eats one snack for every different
// site you visit each day, grows as it eats, and shows on your profile.
import { api } from './api';

export type PetKind = 'blob' | 'cat' | 'chick' | 'dino' | 'ghost';
export type PetStage = 'egg' | 'baby' | 'kid' | 'grown' | 'legend';
export type PetMood = 'egg' | 'stuffed' | 'happy' | 'hungry' | 'lonely';

export type Pet = {
  name: string;
  kind: PetKind;
  colour: string;
  snacks: number;
  stage: PetStage;
  /** Snacks to go until it grows again (null once it's a legend). */
  next: number | null;
  mood: PetMood;
  today: number;
  born: number;
  lastSite?: string | null;
};

/** The pets there are. Names are translated where they're shown. */
export const PET_KINDS: { id: PetKind; name: string }[] = [
  { id: 'blob', name: 'Blob' },
  { id: 'cat', name: 'Cat' },
  { id: 'chick', name: 'Chick' },
  { id: 'dino', name: 'Dino' },
  { id: 'ghost', name: 'Ghost' },
];

export const PET_COLOURS = ['#ff8a5b', '#ffc93c', '#7bd389', '#4cc9f0', '#9b8cff', '#ff6fb5', '#b8b8c8', '#a1887f'];

/** What each stage is called. */
export const STAGE_NAMES: Record<PetStage, string> = {
  egg: 'Egg',
  baby: 'Baby',
  kid: 'Little one',
  grown: 'Grown up',
  legend: 'Legend',
};

/** How it's feeling, in a word or two (on profiles). */
export const MOOD_NAMES: Record<PetMood, string> = {
  egg: 'Not hatched yet',
  stuffed: 'Full up',
  happy: 'Happy',
  hungry: 'Hungry',
  lonely: 'Lonely',
};

class Pets {
  mine = $state<Pet | null>(null);
  /** Whether we've asked the server yet (so the adopt card doesn't flash up first). */
  loaded = $state(false);

  async refresh() {
    try {
      this.mine = (await api<{ pet: Pet | null }>('GET', '/api/pet')).pet;
      this.loaded = true;
    } catch {}
  }

  async save(name: string, kind: PetKind, colour: string) {
    this.mine = (await api<{ pet: Pet }>('PUT', '/api/pet', { name, kind, colour })).pet;
  }

  async letGo() {
    await api('DELETE', '/api/pet');
    this.mine = null;
  }

  reset() {
    this.mine = null;
    this.loaded = false;
  }
}

export const pets = new Pets();
