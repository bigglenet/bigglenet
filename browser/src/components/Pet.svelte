<script lang="ts">
  // A pet, drawn: its kind and colour, how big it's grown and how it feels. With `name`, it's a
  // button: patting it makes it jump, with hearts.
  import type { PetKind, PetMood, PetStage } from '../lib/pet.svelte';
  import { t } from '../lib/i18n.svelte';

  let {
    kind,
    colour,
    stage = 'kid',
    mood = 'happy',
    size = 120,
    name,
  }: { kind: PetKind; colour: string; stage?: PetStage; mood?: PetMood; size?: number; name?: string } = $props();

  const SCALE: Record<PetStage, number> = { egg: 1, baby: 0.62, kid: 0.8, grown: 1, legend: 1 };
  const shade = $derived(`color-mix(in srgb, ${colour} 70%, #000)`);
  const light = $derived(`color-mix(in srgb, ${colour} 55%, #fff)`);
  const ink = '#1d1d27';
  const hatched = $derived(stage !== 'egg');
  const face = $derived(hatched ? mood : 'egg');

  let jumping = $state(false);
  let hearts = $state<{ id: number; x: number }[]>([]);
  let nextHeart = 0;
  function pat() {
    jumping = false;
    requestAnimationFrame(() => (jumping = true));
    const id = nextHeart++;
    hearts = [...hearts, { id, x: 30 + Math.random() * 40 }];
    setTimeout(() => (hearts = hearts.filter((h) => h.id !== id)), 1100);
  }
</script>

{#snippet drawing()}
  <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
    <ellipse cx="60" cy="111" rx={hatched ? 30 * SCALE[stage] : 26} ry="4" fill="#000" opacity=".14" />
    <g class="bob" class:egg={!hatched} class:slow={face === 'lonely'} class:jump={jumping} onanimationend={(e) => e.animationName.endsWith('jump') && (jumping = false)}>
      {#if !hatched}
        <path d="M60 22C82 22 94 58 94 78C94 98 79 110 60 110C41 110 26 98 26 78C26 58 38 22 60 22Z" fill="#f6f1e7" stroke="#0002" stroke-width="1.5" />
        <circle cx="46" cy="60" r="6" fill={colour} />
        <circle cx="72" cy="46" r="5" fill={colour} />
        <circle cx="71" cy="84" r="8" fill={colour} />
        <circle cx="44" cy="93" r="5" fill={colour} />
        <ellipse cx="45" cy="42" rx="6" ry="9" fill="#fff" opacity=".6" transform="rotate(25 45 42)" />
      {:else}
        <g transform={`translate(60 108) scale(${SCALE[stage]}) translate(-60 -108)`}>
          <!-- Behind the body: tails -->
          {#if kind === 'cat'}
            <path d="M94 100C112 98 112 76 103 70" stroke={colour} stroke-width="7" stroke-linecap="round" fill="none" />
          {:else if kind === 'dino'}
            <path d="M90 96C106 102 114 94 117 84C109 92 100 90 92 85Z" fill={colour} />
          {/if}

          <!-- The body -->
          {#if kind === 'ghost'}
            <path d="M24 108V72C24 50 40 36 60 36C80 36 96 50 96 72V108L87 100L78 108L69 100L60 108L51 100L42 108L33 100Z" fill={colour} />
            <ellipse cx="22" cy="80" rx="6" ry="9" fill={colour} transform="rotate(25 22 80)" />
            <ellipse cx="98" cy="80" rx="6" ry="9" fill={colour} transform="rotate(-25 98 80)" />
          {:else}
            {#if kind === 'cat'}
              <path d="M30 58L33 30L54 44Z" fill={colour} />
              <path d="M90 58L87 30L66 44Z" fill={colour} />
              <path d="M35 51L37 37L48 45Z" fill="#ffb3c7" />
              <path d="M85 51L83 37L72 45Z" fill="#ffb3c7" />
            {:else if kind === 'dino'}
              <path d="M42 46L46 30L54 41Z" fill={shade} />
              <path d="M55 40L60 24L66 40Z" fill={shade} />
              <path d="M67 41L75 30L78 46Z" fill={shade} />
            {:else if kind === 'blob'}
              <line x1="60" y1="42" x2="60" y2="27" stroke={shade} stroke-width="3" stroke-linecap="round" />
              <circle cx="60" cy="24" r="5" fill={light} />
            {:else if kind === 'chick'}
              <path d="M57 41C53 31 60 28 60 37M61 40C62 29 70 30 64 40" stroke={colour} stroke-width="4" stroke-linecap="round" fill="none" />
            {/if}
            {#if kind === 'chick'}
              <ellipse cx="24" cy="80" rx="7" ry="12" fill={shade} transform="rotate(20 24 80)" />
              <ellipse cx="96" cy="80" rx="7" ry="12" fill={shade} transform="rotate(-20 96 80)" />
            {/if}
            <ellipse cx="60" cy="74" rx="38" ry="34" fill={colour} />
            <ellipse cx="60" cy="90" rx="22" ry="15" fill={light} opacity=".75" />
          {/if}
          <ellipse cx="44" cy="54" rx="8" ry="5" fill="#fff" opacity=".35" transform="rotate(-30 44 54)" />

          <!-- The face -->
          {#if face === 'stuffed'}
            <path d="M43 71Q48 64 53 71M67 71Q72 64 77 71" stroke={ink} stroke-width="3" stroke-linecap="round" fill="none" />
            <path d="M51 80Q60 93 69 80" stroke={ink} stroke-width="3" stroke-linecap="round" fill="none" />
          {:else}
            <g class="eyes">
              <circle cx="48" cy={face === 'lonely' ? 72 : 70} r="5" fill={ink} />
              <circle cx="72" cy={face === 'lonely' ? 72 : 70} r="5" fill={ink} />
              <circle cx="49.6" cy={face === 'lonely' ? 70.4 : 68.4} r="1.7" fill="#fff" />
              <circle cx="73.6" cy={face === 'lonely' ? 70.4 : 68.4} r="1.7" fill="#fff" />
            </g>
            {#if face === 'happy'}
              <path d="M54 82Q60 88 66 82" stroke={ink} stroke-width="2.5" stroke-linecap="round" fill="none" />
            {:else if face === 'hungry'}
              <ellipse cx="60" cy="84" rx="3.5" ry="4.5" fill={ink} />
            {:else if face === 'lonely'}
              <path d="M42 64L52 60M78 64L68 60" stroke={ink} stroke-width="2.5" stroke-linecap="round" />
              <path d="M54 87Q60 81 66 87" stroke={ink} stroke-width="2.5" stroke-linecap="round" fill="none" />
              <path d="M43 79C41 83 41 86 43 86C45 86 45 83 43 79Z" fill="#6ec6ff" />
            {/if}
          {/if}
          {#if kind === 'chick'}
            <path d="M55 77L65 77L60 84Z" fill="#ff9f1c" />
          {:else if kind === 'cat'}
            <path d="M34 80L19 77M34 84L19 87M86 80L101 77M86 84L101 87" stroke={shade} stroke-width="1.5" stroke-linecap="round" />
          {/if}
          {#if face !== 'lonely'}
            <ellipse cx="39" cy="80" rx="5" ry="3" fill="#ff7aa8" opacity=".45" />
            <ellipse cx="81" cy="80" rx="5" ry="3" fill="#ff7aa8" opacity=".45" />
          {/if}

          {#if stage === 'legend'}
            <path d="M44 41L47 23L55 33L60 18L65 33L73 23L76 41Z" fill="#ffd23f" stroke="#d99a00" stroke-width="1.5" stroke-linejoin="round" />
            <circle cx="60" cy="33" r="2.5" fill="#ff4d6d" />
          {/if}
        </g>
      {/if}
    </g>
  </svg>
{/snippet}

{#if name}
  <button class="pet" style:width="{size}px" style:height="{size}px" onclick={pat} aria-label={t('Pat {name}', { name })} title={t('Pat {name}', { name })}>
    {@render drawing()}
    {#each hearts as heart (heart.id)}
      <span class="heart" style:left="{heart.x}%" aria-hidden="true">❤️</span>
    {/each}
  </button>
{:else}
  <span class="pet" style:width="{size}px" style:height="{size}px">{@render drawing()}</span>
{/if}

<style>
  .pet {
    position: relative;
    display: inline-block;
    flex-shrink: 0;
    padding: 0;
    border: 0;
    background: none;
    line-height: 0;
  }
  button.pet {
    cursor: pointer;
  }
  svg {
    overflow: visible;
  }
  .bob {
    transform-box: view-box;
    transform-origin: 60px 108px;
    animation: bob 2.6s ease-in-out infinite;
  }
  .bob.slow {
    animation-duration: 4.5s;
  }
  .bob.egg {
    animation: wobble 3s ease-in-out infinite;
  }
  .bob.jump {
    animation: jump 0.6s ease-out;
  }
  .eyes {
    transform-box: view-box;
    transform-origin: 60px 70px;
    animation: blink 5s infinite;
  }
  @keyframes bob {
    0%,
    100% {
      transform: translateY(0) scaleY(1);
    }
    50% {
      transform: translateY(-3px) scaleY(1.025);
    }
  }
  @keyframes wobble {
    0%,
    70%,
    100% {
      transform: rotate(0);
    }
    76% {
      transform: rotate(-5deg);
    }
    82% {
      transform: rotate(5deg);
    }
    88% {
      transform: rotate(-3deg);
    }
  }
  @keyframes jump {
    0% {
      transform: translateY(0) scaleY(1);
    }
    15% {
      transform: translateY(0) scaleY(0.9);
    }
    45% {
      transform: translateY(-20px) scaleY(1.06);
    }
    75% {
      transform: translateY(0) scaleY(0.94);
    }
    100% {
      transform: translateY(0) scaleY(1);
    }
  }
  @keyframes blink {
    0%,
    94%,
    100% {
      transform: scaleY(1);
    }
    97% {
      transform: scaleY(0.1);
    }
  }
  .heart {
    position: absolute;
    top: 20%;
    font-size: 18px;
    line-height: 1;
    pointer-events: none;
    animation: float 1.1s ease-out forwards;
  }
  @keyframes float {
    from {
      opacity: 1;
      transform: translate(-50%, 0) scale(0.6);
    }
    to {
      opacity: 0;
      transform: translate(-50%, -50px) scale(1.1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bob,
    .eyes,
    .heart {
      animation: none !important;
    }
  }
</style>
