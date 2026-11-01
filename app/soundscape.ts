/* Asset-driven audio engine. The score and every cue are real recordings kept in
   /public/audio; Web Audio is only used for mixing, ducking, panning and playback. */

export type Effect =
  | 'fracture'
  | 'impact'
  | 'rise'
  | 'portal'
  | 'chime'
  | 'cut'
  | 'tick'
  | 'click'
  | 'vacuum'
  | 'whoosh'
  | 'assemble'
  | 'place';

type Asset = Effect | 'stoneBreak' | 'impactB' | 'impactC';

/* The score streams through a media element: decoded whole, three minutes of stereo
   float PCM is about seventy megabytes held for the life of the tab. */
const MUSIC = '/audio/floating-cities.mp3';

const FILES: Record<Asset, string> = {
  fracture: '/audio/cinematic-explosion.mp3',
  stoneBreak: '/audio/stone-break.ogg',
  impact: '/audio/stone-impact-a.ogg',
  impactB: '/audio/stone-impact-b.ogg',
  impactC: '/audio/stone-impact-c.ogg',
  vacuum: '/audio/deep-whoosh.mp3',
  whoosh: '/audio/camera-whoosh.mp3',
  assemble: '/audio/deep-whoosh.mp3',
  place: '/audio/stone-impact-c.ogg',
  rise: '/audio/deep-whoosh.mp3',
  portal: '/audio/camera-whoosh.mp3',
  chime: '/audio/stone-impact-c.ogg',
  cut: '/audio/cut.wav',
  tick: '/audio/ui-hover.wav',
  click: '/audio/ui-click.wav',
};

const LEVEL: Record<Effect, number> = {
  fracture: .38,
  impact: .40,
  rise: .24,
  portal: .22,
  chime: .25,
  cut: .20,
  tick: .10,
  click: .16,
  vacuum: .24,
  whoosh: .22,
  assemble: .28,
  place: .34,
};

const PAN: Partial<Record<Effect, number>> = {
  fracture: -.18,
  cut: .48,
  portal: .2,
};

export class Soundscape {
  private ctx: AudioContext;
  private master: GainNode;
  private musicGain: GainNode;
  private musicFilter: BiquadFilterNode;
  private duck: GainNode;
  private fxGain: GainNode;
  private buffers = new Map<Asset, AudioBuffer>();
  private ready: Promise<void>;
  private music: HTMLAudioElement | null = null;
  private musicSource: MediaElementAudioSourceNode | null = null;
  private zone = '';
  /* The resonance. Three sine partials and a slow filter, standing in for a struck
     bowl - a sample would be a recording of somebody else's bowl, and this one has to
     be able to bend continuously from a sub-bass drone into a bright ring and back
     into nothing, which a sample cannot do without sounding like a crossfade. */
  private bowl: { osc: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private bowlLevel = -1;
  private lastTick = 0;
  private closing = false;
  enabled = false;

  constructor() {
    this.ctx = new AudioContext();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;

    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 10;
    limiter.ratio.value = 7;
    limiter.attack.value = .004;
    limiter.release.value = .24;

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = .28;
    this.musicFilter = this.ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 18000;
    this.musicFilter.Q.value = .45;
    this.duck = this.ctx.createGain();
    this.duck.gain.value = 1;
    this.fxGain = this.ctx.createGain();
    this.fxGain.gain.value = .44;
    this.musicGain.connect(this.musicFilter);
    this.musicFilter.connect(this.duck);
    this.duck.connect(limiter);
    this.fxGain.connect(limiter);
    limiter.connect(this.master);
    this.master.connect(this.ctx.destination);

    this.ready = this.load();
  }

  private async load(): Promise<void> {
    /* Several cues share a recording. Each file is fetched and decoded once, and
       every name that points at it gets the same buffer. */
    const decoded = new Map<string, Promise<AudioBuffer | null>>();
    const decode = (url: string) => {
      let pending = decoded.get(url);
      if (!pending) {
        pending = fetch(url)
          .then(response => { if (!response.ok) throw new Error(`Audio asset failed: ${url}`); return response.arrayBuffer(); })
          .then(data => this.ctx.decodeAudioData(data))
          .catch(() => null);
        decoded.set(url, pending);
      }
      return pending;
    };
    await Promise.all(Object.entries(FILES).map(async ([name, url]) => {
      const buffer = await decode(url);
      if (buffer) this.buffers.set(name as Asset, buffer);
    }));
  }

  private startMusic(): void {
    if (!this.enabled) return;
    if (!this.music) {
      const element = new Audio(MUSIC);
      element.loop = true;
      element.preload = 'auto';
      element.crossOrigin = 'anonymous';
      this.musicSource = this.ctx.createMediaElementSource(element);
      this.musicSource.connect(this.musicGain);
      this.music = element;
    }
    void this.music.play().catch(() => { /* refused: the effects still play */ });
  }

  async toggle(): Promise<boolean> {
    await this.ctx.resume();
    this.enabled = !this.enabled;
    if (this.enabled) {
      await this.ready;
      this.startMusic();
    }
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.enabled ? .72 : 0, t, this.enabled ? .55 : .18);
    if (this.enabled) this.effect('click');
    // a muted score is paused once it has faded, so it stops costing decode time
    else { const music = this.music; setTimeout(() => { if (!this.enabled) music?.pause(); }, 900); }
    return this.enabled;
  }

  /** Mix the same score differently per act without replacing it or adding noise. */
  /* Where the gold turns into an insect, burns, and comes back as powder.

     The sound follows the material rather than the act: heavy and low while the thing
     is stone, opening into a struck-metal partial as the gold leaves it, brightest at
     the moment it goes into the flame, and then falling away to nothing as the grains
     settle. It is the one place in the piece where the audio is carrying the argument
     instead of dressing it.

     @param heat 0..1 how far into the burn
     @param bright 0..1 the ring, which is at its clearest just after
   */
  resonance(heat: number, bright: number): void {
    if (!this.enabled || this.closing) return;
    const t = this.ctx.currentTime;

    if (!this.bowl && (heat > .001 || bright > .001)) {
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      filter.Q.value = .8;
      /* A struck bowl is not harmonic. These ratios are roughly what a small standing
         bowl gives: a fundamental, a sharp second an octave and a bit above it, and a
         third that beats against the second - the beating is the shimmer. */
      const osc = [1, 2.71, 5.43].map((ratio, i) => {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = 96 * ratio;
        const level = this.ctx.createGain();
        level.gain.value = [.5, .3, .16][i];
        o.connect(level); level.connect(filter);
        o.start();
        return o;
      });
      filter.connect(gain);
      gain.connect(this.duck);
      this.bowl = { osc, gain, filter };
    }
    if (!this.bowl) return;

    /* The fundamental climbs about an octave across the burn. Nothing is retriggered;
       it is one continuous tone that changes what it is, which is the point. */
    const base = 96 + heat * 84;
    this.bowl.osc[0].frequency.setTargetAtTime(base, t, .4);
    this.bowl.osc[1].frequency.setTargetAtTime(base * 2.71, t, .4);
    this.bowl.osc[2].frequency.setTargetAtTime(base * 5.43, t, .4);
    // closed and dark while it is still stone, wide open at the ring
    this.bowl.filter.frequency.setTargetAtTime(340 + bright * 5200, t, .35);

    const level = (heat * .16 + bright * .2);
    if (Math.abs(level - this.bowlLevel) > .004) {
      this.bowlLevel = level;
      this.bowl.gain.gain.setTargetAtTime(level, t, .3);
    }
  }

  update(p: number): void {
    const vacuum = p > .14 && p < .275;
    const workbench = p > .46 && p < .66;
    const finale = p > .86;
    const zone = `${vacuum}${workbench}${finale}`;
    if (zone === this.zone) return;
    this.zone = zone;
    const t = this.ctx.currentTime;
    this.musicGain.gain.setTargetAtTime(vacuum ? .18 : workbench ? .24 : finale ? .34 : .28, t, .75);
    this.musicFilter.frequency.setTargetAtTime(vacuum ? 720 : 18000, t, vacuum ? .08 : .8);
    this.fxGain.gain.setTargetAtTime(vacuum ? .48 : workbench ? .40 : .44, t, .35);
  }

  effect(kind: Effect): void {
    if (!this.enabled) return;
    if (kind === 'tick' && this.ctx.currentTime - this.lastTick < .055) return;
    if (kind === 'tick') this.lastTick = this.ctx.currentTime;

    const play = (asset: Asset, level: number, rate = 1, stereo = 0, delay = 0) => {
      const buffer = this.buffers.get(asset);
      if (!buffer) return;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      const gain = this.ctx.createGain();
      gain.gain.value = level;
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = stereo;
      source.connect(gain);
      gain.connect(pan);
      pan.connect(this.fxGain);
      source.start(this.ctx.currentTime + delay);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        pan.disconnect();
      };
    };

    if (kind === 'fracture') {
      // A recorded detonation carries the transient; a pitched-down duplicate and
      // real rock break provide the body instead of a game-like synthetic pop.
      play('fracture', .42, 1, -.04);
      play('fracture', .18, .57, .08, .018);
      play('stoneBreak', .28, .80, -.18, .025);
      play('vacuum', .22, .76, 0, .15);

      const t = this.ctx.currentTime;
      this.duck.gain.cancelScheduledValues(t);
      this.duck.gain.setValueAtTime(this.duck.gain.value, t);
      this.duck.gain.exponentialRampToValueAtTime(.12, t + .085);
      this.duck.gain.setValueAtTime(.12, t + .46);
      this.duck.gain.exponentialRampToValueAtTime(1, t + 3.1);
      return;
    }

    if (kind === 'impact') {
      // Three independent stone recordings sell the mass of twenty-six fragments.
      play('impact', .38, .76, -.28);
      play('impactB', .28, .92, .22, .075);
      play('impactC', .24, .84, -.05, .17);
      return;
    }

    if (kind === 'assemble') {
      // Air draws inward first; stone follows it into the repaired silhouette.
      play('assemble', .26, .72, .05);
      play('stoneBreak', .14, .64, -.12, .16);
      play('impactB', .10, .70, .18, .34);
      return;
    }

    if (kind === 'place') {
      // A restrained stone-on-board contact with enough low body to end the arc.
      play('place', .34, .62, 0);
      play('impactB', .14, .54, -.08, .035);
      return;
    }

    play(kind, LEVEL[kind], kind === 'tick' ? .94 + Math.random() * .12 : kind === 'cut' ? .9 : 1, PAN[kind] ?? 0);
  }

  close(): void {
    this.bowl?.osc.forEach(o => { try { o.stop(); } catch { /* already stopped */ } });
    this.bowl = null;
    if (this.closing) return;
    this.closing = true;
    this.music?.pause();
    this.musicSource?.disconnect();
    if (this.music) { this.music.removeAttribute('src'); this.music.load(); }
    this.music = null;
    this.musicSource = null;
    // Suspending is deliberately HMR-safe; Vite can run overlapping React
    // cleanups while replacing this module, whereas AudioContext.close() is final.
    if (this.ctx.state === 'running') void this.ctx.suspend().catch(() => { /* already suspended */ });
  }
}
